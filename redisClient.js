import { createClient } from "redis";

const localStore = new Map();
const localExpirations = new Map();

// Helper to clean up expired keys in local store
const getLocal = (key) => {
    const expireAt = localExpirations.get(key);
    if (expireAt && Date.now() > expireAt) {
        localStore.delete(key);
        localExpirations.delete(key);
        return null;
    }
    return localStore.get(key);
};

const setLocal = (key, value, expirySeconds) => {
    localStore.set(key, value);
    if (expirySeconds) {
        localExpirations.set(key, Date.now() + (expirySeconds * 1000));
    } else {
        localExpirations.delete(key);
    }
};

const realRedis = createClient({
    url: 'redis://localhost:6379'
});

let isRedisConnected = false;

// Suppress unhandled event error warnings by attaching a handler
realRedis.on('error', (err) => {
    // Only log once in a while or log gracefully to avoid spamming the console
    if (isRedisConnected) {
        console.log(`Redis disconnected: ${err.message}. Using in-memory fallback.`);
    }
    isRedisConnected = false;
});

realRedis.on('connect', () => {
    console.log(`Redis connected successfully`);
    isRedisConnected = true;
});

// Try to connect asynchronously without blocking server start or throwing unhandled errors
realRedis.connect().catch((err) => {
    isRedisConnected = false;
});

const redisClientWrapper = {
    get: async (key) => {
        if (isRedisConnected) {
            try {
                return await realRedis.get(key);
            } catch (err) {
                isRedisConnected = false;
            }
        }
        return getLocal(key);
    },
    set: async (key, value, options) => {
        let expirySeconds = null;
        if (options && options.EX) {
            expirySeconds = options.EX;
        }
        if (isRedisConnected) {
            try {
                return await realRedis.set(key, value, options);
            } catch (err) {
                isRedisConnected = false;
            }
        }
        setLocal(key, value, expirySeconds);
        return 'OK';
    },
    del: async (key) => {
        if (isRedisConnected) {
            try {
                return await realRedis.del(key);
            } catch (err) {
                isRedisConnected = false;
            }
        }
        const existed = localStore.has(key);
        localStore.delete(key);
        localExpirations.delete(key);
        return existed ? 1 : 0;
    },
    incr: async (key) => {
        if (isRedisConnected) {
            try {
                return await realRedis.incr(key);
            } catch (err) {
                isRedisConnected = false;
            }
        }
        const val = parseInt(getLocal(key) || 0) + 1;
        setLocal(key, val.toString());
        return val;
    },
    expire: async (key, seconds) => {
        if (isRedisConnected) {
            try {
                return await realRedis.expire(key, seconds);
            } catch (err) {
                isRedisConnected = false;
            }
        }
        if (localStore.has(key)) {
            localExpirations.set(key, Date.now() + (seconds * 1000));
            return 1;
        }
        return 0;
    }
};

export { redisClientWrapper as redisClient };