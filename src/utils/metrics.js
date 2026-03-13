/**
 * Metrics Utility for MindTrain
 * 
 * Tracks performance metrics, success/error rates, and cache hits.
 * Ready for integration with Prometheus, CloudWatch, or other monitoring systems.
 */

/**
 * Metrics storage (in-memory for now, can be upgraded to external service)
 */
const metrics = {
    histograms: {},
    counters: {},
    gauges: {}
};

/**
 * Record a histogram value (e.g., query duration)
 * @param {string} name - Metric name
 * @param {number} value - Value to record
 * @param {Object} labels - Optional labels (e.g., { operation: 'getUser' })
 */
const histogram = (name, value, labels = {}) => {
    const key = `${name}${JSON.stringify(labels)}`;
    
    if (!metrics.histograms[key]) {
        metrics.histograms[key] = {
            name,
            labels,
            values: [],
            sum: 0,
            count: 0,
            min: Infinity,
            max: -Infinity
        };
    }

    const metric = metrics.histograms[key];
    metric.values.push(value);
    metric.sum += value;
    metric.count++;
    metric.min = Math.min(metric.min, value);
    metric.max = Math.max(metric.max, value);

    // Keep only last 1000 values to prevent memory issues
    if (metric.values.length > 1000) {
        metric.values.shift();
    }

    // Log in development
    if (process.env.NODE_ENV === 'development') {
        console.debug(`[METRIC] ${name}${JSON.stringify(labels)}: ${value}ms`);
    }
};

/**
 * Increment a counter (e.g., success/error counts)
 * @param {string} name - Metric name
 * @param {number} increment - Amount to increment (default: 1)
 * @param {Object} labels - Optional labels
 */
const increment = (name, increment = 1, labels = {}) => {
    const key = `${name}${JSON.stringify(labels)}`;
    
    if (!metrics.counters[key]) {
        metrics.counters[key] = {
            name,
            labels,
            count: 0
        };
    }

    metrics.counters[key].count += increment;

    // Log in development
    if (process.env.NODE_ENV === 'development') {
        console.debug(`[METRIC] ${name}${JSON.stringify(labels)}: +${increment} (total: ${metrics.counters[key].count})`);
    }
};

/**
 * Set a gauge value (e.g., current cache size)
 * @param {string} name - Metric name
 * @param {number} value - Gauge value
 * @param {Object} labels - Optional labels
 */
const gauge = (name, value, labels = {}) => {
    const key = `${name}${JSON.stringify(labels)}`;
    
    metrics.gauges[key] = {
        name,
        labels,
        value,
        timestamp: new Date()
    };

    // Log in development
    if (process.env.NODE_ENV === 'development') {
        console.debug(`[METRIC] ${name}${JSON.stringify(labels)}: ${value}`);
    }
};

/**
 * Record a metric with automatic timing
 * @param {string} name - Metric name
 * @param {Function} fn - Async function to measure
 * @param {Object} labels - Optional labels
 * @returns {Promise} Result of the function
 */
const record = async (name, fn, labels = {}) => {
    const startTime = Date.now();
    try {
        const result = await fn();
        const duration = Date.now() - startTime;
        histogram(`${name}_duration`, duration, { ...labels, status: 'success' });
        increment(`${name}_total`, 1, { ...labels, status: 'success' });
        return result;
    } catch (error) {
        const duration = Date.now() - startTime;
        histogram(`${name}_duration`, duration, { ...labels, status: 'error' });
        increment(`${name}_total`, 1, { ...labels, status: 'error' });
        throw error;
    }
};

/**
 * Get all metrics (for monitoring/export)
 * @returns {Object} All metrics
 */
const getMetrics = () => {
    return {
        histograms: metrics.histograms,
        counters: metrics.counters,
        gauges: metrics.gauges,
        timestamp: new Date()
    };
};

/**
 * Reset all metrics (useful for testing)
 */
const reset = () => {
    metrics.histograms = {};
    metrics.counters = {};
    metrics.gauges = {};
};

module.exports = {
    histogram,
    increment,
    gauge,
    record,
    getMetrics,
    reset
};

