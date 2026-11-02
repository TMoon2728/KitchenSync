import { extractStepTimers as extractStepTimersCore } from '../shared/culinaryEngines.mjs';

export interface ExtractedStepTimer {
    id: string;
    label: string;
    durationSeconds: number;
    sourceMatch: string;
}

export function extractStepTimers(stepText: string): ExtractedStepTimer[] {
    return extractStepTimersCore(stepText) as ExtractedStepTimer[];
}
