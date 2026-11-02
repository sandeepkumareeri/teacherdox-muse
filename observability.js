/**
 * observability.js — OpenTelemetry Instrumentation for TeacherDox
 *
 * Provides:
 * - Distributed tracing (Jaeger/OTLP)
 * - Metrics (Prometheus)
 * - Structured logging (JSON)
 * - Custom business metrics
 * - Auto-instrumentation for HTTP, DB, Redis
 *
 * Meta-recognized stack: OTel + Prometheus + Grafana
 */

const { NodeTracerProvider } = require('@opentelemetry/sdk-trace-node');
const { SimpleSpanProcessor, BatchSpanProcessor } = require('@opentelemetry/sdk-trace-base');
const { resourceFromAttributes } = require('@opentelemetry/resources');
const { SemanticResourceAttributes } = require('@opentelemetry/semantic-conventions');
const { trace, context, SpanStatusCode } = require('@opentelemetry/api');
const { W3CTraceContextPropagator, W3CBaggagePropagator, CompositePropagator } = require('@opentelemetry/core');
const { PrometheusExporter } = require('@opentelemetry/exporter-prometheus');
const { MeterProvider } = require('@opentelemetry/sdk-metrics');
const { PeriodicExportingMetricReader } = require('@opentelemetry/sdk-metrics');
const { OTLPTraceExporter } = require('@opentelemetry/exporter-trace-otlp-http');
const { OTLPMetricExporter } = require('@opentelemetry/exporter-metrics-otlp-http');
const { registerInstrumentations } = require('@opentelemetry/instrumentation');
const { HttpInstrumentation } = require('@opentelemetry/instrumentation-http');
const { ExpressInstrumentation } = require('@opentelemetry/instrumentation-express');
const { PgInstrumentation } = require('@opentelemetry/instrumentation-pg');
const { RedisInstrumentation } = require('@opentelemetry/instrumentation-redis');
const { GrpcInstrumentation } = require('@opentelemetry/instrumentation-grpc');
const { WinstonInstrumentation } = require('@opentelemetry/instrumentation-winston');
const winston = require('winston');
const { v4: uuidv4 } = require('uuid');

// ==================== UTILITIES ====================

function parseHeaders(headerString) {
  if (!headerString) return {};
  return headerString.split(',').reduce((acc, pair) => {
    const [key, value] = pair.split('=').map(s => s.trim());
    if (key && value) acc[key] = value;
    return acc;
  }, {});
}

// ==================== CONFIGURATION ====================

const DEFAULT_CONFIG = {
  serviceName: 'teacherdox',
  serviceVersion: '1.0.0',
  environment: process.env.NODE_ENV || 'development',
  tenantId: process.env.TENANT_ID || 'default',

  // Exporters
  otlpEndpoint: process.env.OTEL_EXPORTER_OTLP_ENDPOINT || 'http://localhost:4318',
  otlpHeaders: process.env.OTEL_EXPORTER_OTLP_HEADERS || '',
  prometheusPort: parseInt(process.env.PROMETHEUS_PORT || '9464', 10),

  // Sampling
  traceSampleRate: parseFloat(process.env.OTEL_TRACE_SAMPLE_RATE || '1.0'),

  // Metrics
  metricInterval: parseInt(process.env.OTEL_METRIC_INTERVAL || '30000', 10),

  // Logging
  logLevel: process.env.LOG_LEVEL || 'info',
  logFormat: process.env.LOG_FORMAT || 'json', // 'json' | 'pretty'
};

// ==================== RESOURCE ====================

function createResource(config) {
  return resourceFromAttributes({
    [SemanticResourceAttributes.SERVICE_NAME]: config.serviceName,
    [SemanticResourceAttributes.SERVICE_VERSION]: config.serviceVersion,
    [SemanticResourceAttributes.DEPLOYMENT_ENVIRONMENT]: config.environment,
    [SemanticResourceAttributes.CLOUD_PROVIDER]: 'custom',
    'teacherdox.tenant_id': config.tenantId,
    'teacherdox.instance_id': uuidv4(),
  });
}

// ==================== TRACER PROVIDER ====================

function initTracing(config) {
  const provider = new NodeTracerProvider({
    resource: createResource(config),
    sampler: {
      shouldSample: () => ({
        decision: Math.random() < config.traceSampleRate
          ? 2 // RECORD_AND_SAMPLE
          : 1, // DROP
      }),
    },
    spanProcessor: config.otlpEndpoint
      ? new BatchSpanProcessor(new OTLPTraceExporter({
          url: `${config.otlpEndpoint}/v1/traces`,
          headers: parseHeaders(config.otlpHeaders),
        }))
      : undefined,
  });

  // Register
  provider.register({
    propagator: new CompositePropagator({
      propagators: [
        new W3CTraceContextPropagator(),
        new W3CBaggagePropagator(),
      ],
    }),
  });

  return provider;
}

// ==================== METER PROVIDER ====================

function initMetrics(config) {
  // In SDK v3, PrometheusExporter IS a MetricReader (not an Exporter)
  const prometheusExporter = new PrometheusExporter({
    port: config.prometheusPort,
    endpoint: '/metrics',
  });

  const readers = [prometheusExporter];

  // OTLP Metrics Exporter (optional)
  if (config.otlpEndpoint) {
    const otlpMetricExporter = new OTLPMetricExporter({
      url: `${config.otlpEndpoint}/v1/metrics`,
      headers: parseHeaders(config.otlpHeaders),
    });
    const otlpReader = new PeriodicExportingMetricReader({
      exporter: otlpMetricExporter,
      exportIntervalMillis: config.metricInterval,
    });
    readers.push(otlpReader);
  }

  const meterProvider = new MeterProvider({
    resource: createResource(config),
    readers,
  });

  return { meterProvider, prometheusExporter };
}

// ==================== INSTRUMENTATIONS ====================

function setupInstrumentations(config) {
  return registerInstrumentations({
    instrumentations: [
      new HttpInstrumentation({
        requestHook: (span, request) => {
          span.setAttribute('http.request.header.x-tenant-id', request.headers['x-tenant-id']);
          span.setAttribute('http.request.header.x-forwarded-for', request.headers['x-forwarded-for']);
        },
        responseHook: (span, response) => {
          span.setAttribute('http.response.header.x-tenant-id', response.getHeader('x-tenant-id'));
        },
      }),
      new ExpressInstrumentation({
        requestHook: (span, request) => {
          if (request.tenant) {
            span.setAttribute('teacherdox.tenant_id', request.tenant.config.tenantId);
            span.setAttribute('teacherdox.tenant_type', request.tenant.config.type);
          }
        },
      }),
      new PgInstrumentation({
        enhancedDatabaseReporting: true,
        responseHook: (span, query) => {
          span.setAttribute('db.operation', query?.text?.split(' ')[0]?.toUpperCase());
        },
      }),
      new RedisInstrumentation({
        responseHook: (span, cmd) => {
          span.setAttribute('redis.command', cmd[0]?.toUpperCase());
        },
      }),
      new GrpcInstrumentation(),
      new WinstonInstrumentation(),
    ],
    tracerProvider: trace.getTracerProvider(),
    meterProvider: global.meterProvider,
  });
}

// ==================== CUSTOM METRICS ====================

class TeacherdoxMetrics {
  constructor(meter) {
    this.meter = meter;

    // HTTP metrics
    this.httpRequests = meter.createCounter('teacherdox_http_requests_total', {
      description: 'Total HTTP requests',
      unit: '1',
    });
    this.httpDuration = meter.createHistogram('teacherdox_http_request_duration_seconds', {
      description: 'HTTP request duration',
      unit: 's',
    });
    this.httpErrors = meter.createCounter('teacherdox_http_errors_total', {
      description: 'Total HTTP errors',
      unit: '1',
    });

    // WhatsApp metrics
    this.whatsappInbound = meter.createCounter('teacherdox_whatsapp_inbound_total', {
      description: 'Inbound WhatsApp messages',
      unit: '1',
    });
    this.whatsappOutbound = meter.createCounter('teacherdox_whatsapp_outbound_total', {
      description: 'Outbound WhatsApp messages',
      unit: '1',
    });
    this.whatsappErrors = meter.createCounter('teacherdox_whatsapp_errors_total', {
      description: 'WhatsApp errors',
      unit: '1',
    });

    // AI metrics
    this.aiRequests = meter.createCounter('teacherdox_ai_requests_total', {
      description: 'AI model requests',
      unit: '1',
    });
    this.aiLatency = meter.createHistogram('teacherdox_ai_latency_seconds', {
      description: 'AI model latency',
      unit: 's',
    });
    this.aiTokens = meter.createCounter('teacherdox_ai_tokens_total', {
      description: 'AI tokens used',
      unit: '1',
    });
    this.aiCost = meter.createCounter('teacherdox_ai_cost_units_total', {
      description: 'AI cost in relative units',
      unit: '1',
    });
    this.aiFallbacks = meter.createCounter('teacherdox_ai_fallbacks_total', {
      description: 'AI fallback to Gemini',
      unit: '1',
    });

    // Diary metrics
    this.entriesCreated = meter.createCounter('teacherdox_entries_created_total', {
      description: 'Diary entries created',
      unit: '1',
    });
    this.entriesSigned = meter.createCounter('teacherdox_entries_signed_total', {
      description: 'Diary entries signed',
      unit: '1',
    });
    this.entriesAutoSigned = meter.createCounter('teacherdox_entries_auto_signed_total', {
      description: 'Diary entries auto-signed',
      unit: '1',
    });

    // Teacher metrics
    this.activeTeachers = meter.createUpDownCounter('teacherdox_active_teachers', {
      description: 'Currently active teachers',
      unit: '1',
    });
    this.enrolledTeachers = meter.createCounter('teacherdox_enrolled_teachers_total', {
      description: 'Teachers enrolled in zero-effort',
      unit: '1',
    });

    // Language metrics
    this.languageDetection = meter.createCounter('teacherdox_language_detection_total', {
      description: 'Language detections',
      unit: '1',
    });
    this.translationRequests = meter.createCounter('teacherdox_translation_requests_total', {
      description: 'Translation requests',
      unit: '1',
    });

    // Tenant metrics
    this.tenantCount = meter.createUpDownCounter('teacherdox_tenant_count', {
      description: 'Number of tenants',
      unit: '1',
    });
  }

  // HTTP
  recordHttpRequest(method, route, statusCode, duration, tenantId) {
    const labels = { method, route, status: String(statusCode), tenant: tenantId || 'unknown' };
    this.httpRequests.add(1, labels);
    this.httpDuration.record(duration / 1000, labels);
    if (statusCode >= 400) this.httpErrors.add(1, labels);
  }

  // WhatsApp
  recordInboundMessage(type, language, tenantId) {
    this.whatsappInbound.add(1, { type, language, tenant: tenantId });
  }
  recordOutboundMessage(purpose, category, status, tenantId) {
    this.whatsappOutbound.add(1, { purpose, category, status, tenant: tenantId });
  }
  recordWhatsAppError(errorCode, tenantId) {
    this.whatsappErrors.add(1, { error: errorCode, tenant: tenantId });
  }

  // AI
  recordAiRequest(model, task, language, success, latencyMs, tokens, cost, tenantId) {
    const labels = { model, task, language, success: String(success), tenant: tenantId };
    this.aiRequests.add(1, labels);
    this.aiLatency.record(latencyMs / 1000, labels);
    if (tokens) this.aiTokens.add(tokens, labels);
    if (cost) this.aiCost.add(cost, labels);
  }
  recordFallback(reason, tenantId) {
    this.aiFallbacks.add(1, { reason, tenant: tenantId });
  }

  // Diary
  recordEntryCreated(grade, subject, language, tenantId) {
    this.entriesCreated.add(1, { grade, subject, language, tenant: tenantId });
  }
  recordEntrySigned(signer, tenantId) {
    this.entriesSigned.add(1, { signer, tenant: tenantId });
  }
  recordAutoSigned(tenantId) {
    this.entriesAutoSigned.add(1, { tenant: tenantId });
  }

  // Teachers
  setActiveTeachers(count, tenantId) {
    this.activeTeachers.add(count, { tenant: tenantId });
  }
  recordEnrollment(tenantId) {
    this.enrolledTeachers.add(1, { tenant: tenantId });
  }

  // Language
  recordLanguageDetection(language, confidence, tenantId) {
    this.languageDetection.add(1, { language, confidence: String(confidence), tenant: tenantId });
  }
  recordTranslation(sourceLang, targetLang, tenantId) {
    this.translationRequests.add(1, { source: sourceLang, target: targetLang, tenant: tenantId });
  }

  // Tenant
  setTenantCount(count) {
    this.tenantCount.add(count);
  }
}

// ==================== STRUCTURED LOGGING ====================

function createLogger(config) {
  const formats = [];

  if (config.logFormat === 'json') {
    formats.push(winston.format.timestamp());
    formats.push(winston.format.errors({ stack: true }));
    formats.push(winston.format((info) => {
      info.service = config.serviceName;
      info.version = config.serviceVersion;
      info.environment = config.environment;
      info.tenant_id = config.tenantId;
      return info;
    })());
    formats.push(winston.format.json());
  } else {
    formats.push(winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }));
    formats.push(winston.format.errors({ stack: true }));
    formats.push(winston.format.colorize());
    formats.push(winston.format.printf(({ timestamp, level, message, ...meta }) => {
      const metaStr = Object.keys(meta).length ? JSON.stringify(meta) : '';
      return `${timestamp} [${level}]: ${message} ${metaStr}`;
    }));
  }

  return winston.createLogger({
    level: config.logLevel,
    format: winston.format.combine(...formats),
    defaultMeta: { service: config.serviceName },
    transports: [
      new winston.transports.Console(),
    ],
  });
}

// ==================== MIDDLEWARE ====================

function createObservabilityMiddleware(metrics, logger) {
  return (req, res, next) => {
    const startTime = Date.now();
    const tenantId = req.tenant?.config?.tenantId || 'unknown';

    // Add trace context to response headers
    const span = trace.getSpan(context.active());
    if (span) {
      res.setHeader('x-trace-id', span.spanContext().traceId);
      res.setHeader('x-span-id', span.spanContext().spanId);
    }

    // Log request
    logger.info('HTTP Request', {
      method: req.method,
      url: req.url,
      tenantId,
      traceId: span?.spanContext().traceId,
      spanId: span?.spanContext().spanId,
    });

    // Capture response
    const originalSend = res.send;
    res.send = function (body) {
      const duration = Date.now() - startTime;
      metrics.recordHttpRequest(req.method, req.route?.path || req.path, res.statusCode, duration, tenantId);

      logger.info('HTTP Response', {
        method: req.method,
        url: req.url,
        statusCode: res.statusCode,
        durationMs: duration,
        tenantId,
        traceId: span?.spanContext().traceId,
      });

      return originalSend.call(this, body);
    };

    next();
  };
}

// ==================== TRACING HELPERS ====================

function createSpan(name, options = {}) {
  const tracer = trace.getTracer('teacherdox');
  return tracer.startActiveSpan(name, options);
}

function addSpanAttributes(attributes) {
  const span = trace.getSpan(context.active());
  if (span) {
    for (const [key, value] of Object.entries(attributes)) {
      span.setAttribute(key, value);
    }
  }
}

function recordSpanError(error) {
  const span = trace.getSpan(context.active());
  if (span) {
    span.recordException(error);
    span.setStatus({ code: SpanStatusCode.ERROR, message: error.message });
  }
}

function endSpan() {
  const span = trace.getSpan(context.active());
  if (span) {
    span.end();
  }
}

// ==================== INITIALIZATION ====================

let initialized = false;
let loggerInstance = null;
let metricsInstance = null;
let tracerProviderInstance = null;
let meterProviderInstance = null;

function initObservability(userConfig = {}) {
  if (initialized) {
    console.warn('[Observability] Already initialized');
    return { logger: loggerInstance, metrics: metricsInstance };
  }

  const config = { ...DEFAULT_CONFIG, ...userConfig };

  // Initialize tracing
  tracerProviderInstance = initTracing(config);

  // Initialize metrics
  const { meterProvider, prometheusExporter } = initMetrics(config);
  meterProviderInstance = meterProvider;
  global.meterProvider = meterProvider;

  // Register instrumentations
  setupInstrumentations(config);

  // Create logger
  loggerInstance = createLogger(config);

  // Create metrics
  const meter = meterProvider.getMeter('teacherdox');
  metricsInstance = new TeacherdoxMetrics(meter);

  // Start Prometheus server
  if (prometheusExporter) {
    prometheusExporter.startServer().then(() => {
      console.log(`[Observability] Prometheus metrics on port ${config.prometheusPort}`);
    });
  }

  initialized = true;
  console.log('[Observability] Initialized:', {
    serviceName: config.serviceName,
    environment: config.environment,
    tenantId: config.tenantId,
  });

  return { logger: loggerInstance, metrics: metricsInstance };
}

function getLogger() {
  if (!loggerInstance) throw new Error('Observability not initialized. Call initObservability() first.');
  return loggerInstance;
}

function getMetrics() {
  if (!metricsInstance) throw new Error('Observability not initialized. Call initObservability() first.');
  return metricsInstance;
}

async function shutdown() {
  const promises = [];
  if (tracerProviderInstance) {
    promises.push(tracerProviderInstance.shutdown());
  }
  if (meterProviderInstance) {
    promises.push(meterProviderInstance.shutdown());
  }
  await Promise.all(promises);
  initialized = false;
  console.log('[Observability] Shutdown complete');
}

module.exports = {
  initObservability,
  getLogger,
  getMetrics,
  shutdown,
  createObservabilityMiddleware,
  createSpan,
  addSpanAttributes,
  recordSpanError,
  endSpan,
  TeacherdoxMetrics,
};