/**
 * tenant.js — Multi-Tenancy Core
 *
 * Supports multiple isolation strategies:
 * - SCHEMA_PER_TENANT: Each tenant gets own Postgres schema (best isolation)
 * - SHARED_TABLES: Single DB, tenant_id column on every table (simpler, lower cost)
 * - HYBRID: Shared auth/config, per-tenant data schemas
 *
 * Designed for state/country deployments with data sovereignty.
 */

const crypto = require('crypto');

const ISOLATION_STRATEGIES = {
  SCHEMA_PER_TENANT: 'schema_per_tenant',
  SHARED_TABLES: 'shared_tables',
  HYBRID: 'hybrid',
};

// Default tenant configuration template
const DEFAULT_TENANT_CONFIG = {
  // Identity
  tenantId: '',
  name: '',
  displayName: '',
  type: 'state', // 'state', 'country', 'district', 'school', 'demo'
  parentTenantId: null, // For hierarchical (country → state → district)

  // Domain & Branding
  domain: '', // e.g., 'ap.teacherdox.in'
  subdomain: '', // e.g., 'ap'
  logoUrl: '',
  primaryColor: '#1a73e8',
  secondaryColor: '#34a853',

  // Localization
  defaultLanguage: 'en',
  supportedLanguages: ['en', 'hi', 'ml', 'te', 'ta', 'kn', 'bn', 'gu', 'mr', 'pa', 'or', 'as', 'ur'],
  rtlLanguages: ['ur', 'ar', 'fa'],
  dateFormat: 'DD/MM/YYYY',
  timeFormat: 'HH:mm',
  timezone: 'Asia/Kolkata',
  weekStart: 1, // 0=Sun, 1=Mon

  // Education System
  board: 'state', // 'cbse', 'icse', 'ib', 'state', 'cambridge'
  grades: ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12'],
  gradeLabels: {}, // e.g., { '10': 'SSC', '12': 'HSC' }
  subjects: [], // Will be populated from geo data
  periodsPerDay: 8,
  periodDuration: 40, // minutes

  // Compliance & Policy
  diaryMandatory: true,
  signDeadline: '20:00', // IST
  autoSignEnabled: true,
  headmasterCountersignRequired: true,
  meoEndorsementRequired: false,
  deoEndorsementRequired: false,
  dataRetentionDays: 365 * 7, // 7 years
  evidenceRetentionDays: 365, // 1 year for raw photos/voice
  auditLogRetentionDays: 365 * 10,

  // Privacy & Consent
  consentRequired: true,
  consentVersion: '1.0',
  metaAiOptInDefault: false,
  metaAiAllowedRoles: ['teacher', 'hm'], // Roles allowed to use Meta backend
  piiFields: ['phone', 'name', 'address', 'aadhaar'],

  // AI Configuration
  aiBackend: 'gemini', // 'meta' | 'gemini' | 'hybrid'
  aiModels: {
    chat: 'meta-llama/Llama-3.3-70B-Instruct',
    vision: 'meta-llama/Llama-3.2-90B-Vision-Instruct',
    transcribe: 'muse-voice-transcribe',
    translation: 'nllb-200-distilled-600M',
    speech: 'seamless-m4t-v2-large',
    segmentation: 'sam-3.1',
  },
  aiDailyLimit: 500,
  aiPerUserLimit: 40,
  confidenceThresholds: {
    autoAccept: 0.95,
    flagWarn: 0.80,
    flagEdit: 0.60,
    reject: 0.60,
  },

  // WhatsApp Configuration
  whatsapp: {
    provider: 'aisensy', // 'aisensy' | 'meta' | 'twilio'
    businessNumber: '',
    templateNamespace: '',
    templates: {
      otp: '',
      reengage: '',
      digest: '',
      signReminder: '',
      invite: '',
    },
    webhookUrl: '',
    messageCap: 3, // per teacher per day (zero-effort mode)
  },

  // Integrations
  integrations: {
    udise: { enabled: true, apiEndpoint: '', apiKey: '' },
    ndear: { enabled: false, apiEndpoint: '', clientId: '', clientSecret: '' },
    diksha: { enabled: false, apiEndpoint: '', apiKey: '' },
    statePortal: { enabled: false, apiEndpoint: '', apiKey: '' },
    sso: { enabled: false, provider: '', config: {} },
  },

  // Infrastructure
  database: {
    isolation: ISOLATION_STRATEGIES.SCHEMA_PER_TENANT,
    host: '',
    port: 5432,
    name: '', // For shared_tables: main DB name; for schema_per_tenant: template DB
    username: '',
    password: '',
    ssl: true,
    poolSize: 20,
    schemaPrefix: 'tdx_', // For schema_per_tenant
  },
  storage: {
    provider: 'supabase', // 'supabase' | 's3' | 'gcs' | 'local'
    bucket: '',
    region: '',
    cdnUrl: '',
    encryption: true,
  },
  cache: {
    provider: 'redis', // 'redis' | 'memory'
    host: '',
    port: 6379,
    ttl: 3600,
  },

  // Monitoring
  observability: {
    enabled: true,
    logLevel: 'info',
    metricsEndpoint: '',
    tracingEndpoint: '',
    alertingWebhook: '',
  },

  // Features flags
  features: {
    zeroEffortMode: true,
    liveDiary: true,
    pdfGeneration: true,
    dashboard: true,
    apiAccess: true,
    webRegistration: true,
    billing: false,
    multiSchool: true,
    teacherTransfer: true,
    guestTeacher: true,
  },

  // Status
  status: 'active', // 'active', 'suspended', 'pending', 'archived'
  createdAt: null,
  activatedAt: null,
  suspendedAt: null,
  suspendedReason: '',
};

class Tenant {
  constructor(config = {}) {
    this.config = { ...DEFAULT_TENANT_CONFIG, ...config };
    this.validate();
    this.config.createdAt = this.config.createdAt || new Date().toISOString();
    this.config.tenantId = this.config.tenantId || this.generateTenantId(this.config.name || this.config.subdomain);
  }

  validate() {
    if (!this.config.name) throw new Error('Tenant name is required');
    if (!this.config.subdomain) throw new Error('Tenant subdomain is required');
    if (!/^[a-z0-9-]+$/.test(this.config.subdomain)) {
      throw new Error('Subdomain must be lowercase alphanumeric with hyphens only');
    }
    if (!Object.values(ISOLATION_STRATEGIES).includes(this.config.database.isolation)) {
      throw new Error(`Invalid isolation strategy: ${this.config.database.isolation}`);
    }
  }

  generateTenantId(name) {
    const base = name.toLowerCase().replace(/[^a-z0-9]/g, '-').substring(0, 20);
    const suffix = crypto.randomBytes(4).toString('hex');
    return `${base}-${suffix}`;
  }

  getSchemaName() {
    if (this.config.database.isolation === ISOLATION_STRATEGIES.SCHEMA_PER_TENANT) {
      return `${this.config.database.schemaPrefix}${this.config.tenantId.replace(/-/g, '_')}`;
    }
    return 'public';
  }

  getDatabaseName() {
    return this.config.database.name;
  }

  getConnectionConfig() {
    return {
      host: this.config.database.host,
      port: this.config.database.port,
      database: this.getDatabaseName(),
      user: this.config.database.username,
      password: this.config.database.password,
      ssl: this.config.database.ssl,
      searchPath: this.getSchemaName(),
    };
  }

  // Merge with parent tenant config (for hierarchical tenants)
  mergeWithParent(parentTenant) {
    if (!parentTenant) return this.config;

    const merged = { ...parentTenant.config, ...this.config };

    // Deep merge objects
    for (const key of ['aiModels', 'whatsapp', 'integrations', 'database', 'storage', 'cache', 'observability', 'features', 'confidenceThresholds']) {
      if (parentTenant.config[key] && this.config[key]) {
        merged[key] = { ...parentTenant.config[key], ...this.config[key] };
      }
    }

    return merged;
  }

  toJSON() {
    return { ...this.config };
  }

  // Create minimal public config for client-side
  toPublicConfig() {
    return {
      tenantId: this.config.tenantId,
      name: this.config.name,
      displayName: this.config.displayName,
      type: this.config.type,
      domain: this.config.domain,
      subdomain: this.config.subdomain,
      logoUrl: this.config.logoUrl,
      primaryColor: this.config.primaryColor,
      secondaryColor: this.config.secondaryColor,
      defaultLanguage: this.config.defaultLanguage,
      supportedLanguages: this.config.supportedLanguages,
      rtlLanguages: this.config.rtlLanguages,
      dateFormat: this.config.dateFormat,
      timeFormat: this.config.timeFormat,
      timezone: this.config.timezone,
      board: this.config.board,
      grades: this.config.grades,
      gradeLabels: this.config.gradeLabels,
      periodsPerDay: this.config.periodsPerDay,
      signDeadline: this.config.signDeadline,
      autoSignEnabled: this.config.autoSignEnabled,
      headmasterCountersignRequired: this.config.headmasterCountersignRequired,
      features: this.config.features,
      status: this.config.status,
    };
  }
}

module.exports = {
  Tenant,
  DEFAULT_TENANT_CONFIG,
  ISOLATION_STRATEGIES,
};