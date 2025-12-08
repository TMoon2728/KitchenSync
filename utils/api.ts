export const API_BASE = '/api';

export const authFetch = async (url: string, options: RequestInit = {}) => {
    const token = localStorage.getItem('ks_token');
    const headers = {
        'Content-Type': 'application/json',
        ...options.headers,
        ...(token ? { 'Authorization': `Bearer ${token}` } : {})
    };
    const res = await fetch(url, { ...options, headers });

    // Check if response is JSON
    const contentType = res.headers.get("content-type");
    if (contentType && contentType.includes("application/json")) {
        return res; // Let the caller handle .json() but at least we know it's there? 
        // Actually caller expects result of fetch, so we return res. 
        // But if the caller calls res.json() blindly on a 500 HTML it crashes.
    }

    // If not JSON and not OK, throw error with text
    if (!res.ok) {
        const text = await res.text();
        throw new Error(`API Error ${res.status}: ${text.slice(0, 100)}`);
    }

    return res;
};
