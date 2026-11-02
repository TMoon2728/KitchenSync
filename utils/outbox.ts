import { authFetch } from './api';

export interface OutboxMutation {
    id: string;
    url: string;
    method: 'POST' | 'PUT' | 'PATCH' | 'DELETE';
    body?: string;
    createdAt: number;
}

const OUTBOX_STORAGE_KEY = 'ks_mutation_outbox';
const MAX_OUTBOX_SIZE = 100;

export function getOutboxQueue(): OutboxMutation[] {
    try {
        const raw = localStorage.getItem(OUTBOX_STORAGE_KEY);
        if (!raw) return [];
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed : [];
    } catch {
        return [];
    }
}

function saveOutboxQueue(queue: OutboxMutation[]): void {
    try {
        localStorage.setItem(OUTBOX_STORAGE_KEY, JSON.stringify(queue.slice(-MAX_OUTBOX_SIZE)));
    } catch {
        // Ignore storage quota errors
    }
}

export function enqueueOutboxMutation(mutation: Omit<OutboxMutation, 'id' | 'createdAt'>): void {
    const queue = getOutboxQueue();
    // Coalesce consecutive PUT/PATCH to the same endpoint (e.g., /api/data/meal-plan)
    const filtered = (mutation.method === 'PUT' || mutation.method === 'PATCH')
        ? queue.filter(item => !(item.url === mutation.url && item.method === mutation.method))
        : queue;

    filtered.push({
        ...mutation,
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        createdAt: Date.now()
    });
    saveOutboxQueue(filtered);
}

let isFlushing = false;

export async function flushOutboxQueue(getAccessToken: () => Promise<string>): Promise<number> {
    if (isFlushing) return 0;
    const queue = getOutboxQueue();
    if (queue.length === 0) return 0;

    isFlushing = true;
    let flushedCount = 0;
    try {
        const token = await getAccessToken();
        const remaining: OutboxMutation[] = [];

        for (const item of queue) {
            try {
                const res = await authFetch(item.url, {
                    method: item.method,
                    ...(item.body ? { body: item.body } : {}),
                    token
                });
                if (res.ok || (res.status >= 400 && res.status < 500 && res.status !== 429)) {
                    // Drop 4xx permanent rejections so poison pills never block the queue
                    flushedCount++;
                } else {
                    remaining.push(item);
                }
            } catch {
                remaining.push(item);
            }
        }

        saveOutboxQueue(remaining);
        return flushedCount;
    } catch {
        return flushedCount;
    } finally {
        isFlushing = false;
    }
}
