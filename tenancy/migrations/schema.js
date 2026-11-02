/**
 * schema.js — Multi-Tenant Database Schema Management
 *
 * Handles:
 * - Template schema creation (for schema_per_tenant)
 * - Shared tables with tenant_id (for shared_tables)
 * - Migration runner for tenant onboarding
 * - Schema versioning and rollback
 */

const { ISOLATION_STRATEGIES } = require('../tenant.js');

/**
 * Core TeacherDox tables (always exist in template/public schema)
 */
const CORE_TABLES = `
-- ==================== CORE TABLES (Shared or Template) ====================

-- Tenants table (always in public schema)
CREATE TABLE IF NOT EXISTS public.tenants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  display_name TEXT,
  type TEXT NOT NULL DEFAULT 'demo', -- 'state', 'country', 'district', 'school', 'demo'
  parent_tenant_id UUID REFERENCES public.tenants(id),
  subdomain TEXT UNIQUE,
  domain TEXT UNIQUE,
  config JSONB NOT NULL DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'pending', -- 'active', 'suspended', 'pending', 'archived'
  created_at TIMESTAMPTZ DEFAULT NOW(),
  activated_at TIMESTAMPTZ,
  suspended_at TIMESTAMPTZ,
  suspended_reason TEXT,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tenants_subdomain ON public.tenants(subdomain);
CREATE INDEX IF NOT EXISTS idx_tenants_domain ON public.tenants(domain);
CREATE INDEX IF NOT EXISTS idx_tenants_parent ON public.tenants(parent_tenant_id);
CREATE INDEX IF NOT EXISTS idx_tenants_status ON public.tenants(status);

-- Users table (shared or per-tenant)
CREATE TABLE IF NOT EXISTS {SCHEMA}.users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id),
  tdx_id TEXT UNIQUE NOT NULL, -- TDX-T-{stateCode}-{hash}
  name TEXT NOT NULL,
  phone TEXT NOT NULL,
  email TEXT,
  role TEXT NOT NULL DEFAULT 'teacher', -- 'teacher', 'hm', 'meo', 'deo', 'admin', 'support'
  school_code TEXT,
  school_name TEXT,
  subject TEXT,
  grade_sections JSONB DEFAULT '[]', -- [{"grade": "8", "section": "A", "subject": "Science"}]
  language TEXT DEFAULT 'en',
  member_number INTEGER,
  member_total INTEGER,
  is_founding_member BOOLEAN DEFAULT FALSE,
  is_zero_effort BOOLEAN DEFAULT FALSE,
  meta_ai_opt_in BOOLEAN DEFAULT FALSE,
  status TEXT DEFAULT 'active', -- 'active', 'inactive', 'suspended'
  last_active_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_users_tenant ON {SCHEMA}.users(tenant_id);
CREATE INDEX IF NOT EXISTS idx_users_phone ON {SCHEMA}.users(phone);
CREATE INDEX IF NOT EXISTS idx_users_tdx_id ON {SCHEMA}.users(tdx_id);
CREATE INDEX IF NOT EXISTS idx_users_role ON {SCHEMA}.users(role);
CREATE INDEX IF NOT EXISTS idx_users_school ON {SCHEMA}.users(school_code);

-- Schools table
CREATE TABLE IF NOT EXISTS {SCHEMA}.schools (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id),
  udise_code TEXT UNIQUE,
  name TEXT NOT NULL,
  address TEXT,
  district TEXT,
  block TEXT,
  cluster TEXT,
  state TEXT,
  pincode TEXT,
  phone TEXT,
  email TEXT,
  headmaster_name TEXT,
  headmaster_phone TEXT,
  type TEXT, -- 'govt', 'aided', 'unaided', 'central', 'private'
  management TEXT, -- 'state', 'local_body', 'tribal', 'social_welfare', 'central_govt'
  lowest_class TEXT,
  highest_class TEXT,
  medium_of_instruction TEXT[],
  total_teachers INTEGER,
  total_students INTEGER,
  geo_location GEOGRAPHY(POINT),
  config JSONB DEFAULT '{}',
  status TEXT DEFAULT 'active',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_schools_tenant ON {SCHEMA}.schools(tenant_id);
CREATE INDEX IF NOT EXISTS idx_schools_udise ON {SCHEMA}.schools(udise_code);
CREATE INDEX IF NOT EXISTS idx_schools_district ON {SCHEMA}.schools(district);

-- Inbound messages (WhatsApp messages received)
CREATE TABLE IF NOT EXISTS {SCHEMA}.inbound_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id),
  teacher_id UUID REFERENCES {SCHEMA}.users(id),
  chat_id TEXT NOT NULL, -- WhatsApp phone number
  type TEXT NOT NULL, -- 'photo', 'voice', 'text', 'document', 'unsupported'
  mime_type TEXT,
  storage_path TEXT, -- Supabase Storage path
  hash TEXT, -- SHA-256 of content
  text_content TEXT, -- For text messages
  meta JSONB, -- Raw WhatsApp message metadata
  captured_at TIMESTAMPTZ DEFAULT NOW(),
  processed BOOLEAN DEFAULT FALSE,
  processed_at TIMESTAMPTZ,
  processing_error TEXT
);

CREATE INDEX IF NOT EXISTS idx_inbound_tenant ON {SCHEMA}.inbound_messages(tenant_id);
CREATE INDEX IF NOT EXISTS idx_inbound_teacher ON {SCHEMA}.inbound_messages(teacher_id);
CREATE INDEX IF NOT EXISTS idx_inbound_chat ON {SCHEMA}.inbound_messages(chat_id);
CREATE INDEX IF NOT EXISTS idx_inbound_captured ON {SCHEMA}.inbound_messages(captured_at);
CREATE INDEX IF NOT EXISTS idx_inbound_processed ON {SCHEMA}.inbound_messages(processed) WHERE processed = FALSE;

-- Outbound messages (WhatsApp messages sent)
CREATE TABLE IF NOT EXISTS {SCHEMA}.outbound_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id),
  teacher_id UUID REFERENCES {SCHEMA}.users(id),
  chat_id TEXT NOT NULL,
  type TEXT NOT NULL, -- 'text', 'template', 'interactive', 'media'
  template_name TEXT,
  template_language TEXT,
  content JSONB, -- Message content
  status TEXT DEFAULT 'pending', -- 'pending', 'sent', 'delivered', 'read', 'failed'
  provider_message_id TEXT,
  purpose TEXT, -- 'otp', 'welcome', 'digest', 'reminder', 'invite', 'admin', 'broadcast'
  category TEXT, -- 'transactional', 'marketing', 'utility'
  error_code TEXT,
  error_message TEXT,
  sent_at TIMESTAMPTZ,
  delivered_at TIMESTAMPTZ,
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_outbound_tenant ON {SCHEMA}.outbound_messages(tenant_id);
CREATE INDEX IF NOT EXISTS idx_outbound_teacher ON {SCHEMA}.outbound_messages(teacher_id);
CREATE INDEX IF NOT EXISTS idx_outbound_status ON {SCHEMA}.outbound_messages(status);
CREATE INDEX IF NOT EXISTS idx_outbound_created ON {SCHEMA}.outbound_messages(created_at);

-- Draft entries (AI-generated, not yet reviewed)
CREATE TABLE IF NOT EXISTS {SCHEMA}.draft_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id),
  teacher_id UUID NOT NULL REFERENCES {SCHEMA}.users(id),
  school_id UUID REFERENCES {SCHEMA}.schools(id),
  class_grade TEXT NOT NULL,
  class_section TEXT NOT NULL,
  subject TEXT NOT NULL,
  period INTEGER NOT NULL,
  entry_date DATE NOT NULL,
  topic TEXT,
  summary TEXT,
  method TEXT,
  attendance TEXT,
  homework TEXT,
  carry_forward TEXT,
  language TEXT DEFAULT 'en',
  evidence JSONB, -- { photos: [], voice: [], text: [] }
  ai_metadata JSONB, -- { backend, model, confidence, flags, processed_at }
  version INTEGER DEFAULT 1,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_draft_tenant ON {SCHEMA}.draft_entries(tenant_id);
CREATE INDEX IF NOT EXISTS idx_draft_teacher_date ON {SCHEMA}.draft_entries(teacher_id, entry_date);
CREATE INDEX IF NOT EXISTS idx_draft_class_date ON {SCHEMA}.draft_entries(class_grade, class_section, entry_date);

-- Diary entries (signed/locked entries)
CREATE TABLE IF NOT EXISTS {SCHEMA}.diary_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id),
  draft_id UUID REFERENCES {SCHEMA}.draft_entries(id),
  teacher_id UUID NOT NULL REFERENCES {SCHEMA}.users(id),
  school_id UUID REFERENCES {SCHEMA}.schools(id),
  class_grade TEXT NOT NULL,
  class_section TEXT NOT NULL,
  subject TEXT NOT NULL,
  period INTEGER NOT NULL,
  entry_date DATE NOT NULL,
  topic TEXT NOT NULL,
  summary TEXT NOT NULL,
  method TEXT,
  attendance TEXT,
  homework TEXT,
  carry_forward TEXT,
  language TEXT DEFAULT 'en',
  evidence JSONB,
  ai_metadata JSONB,
  tdx_capsule JSONB, -- Full .tdx capsule
  lifecycle_state TEXT DEFAULT 'draft', -- 'draft', 'teacher_review', 'confirmed_locked', 'headmaster_review', 'auto_locked', 'archived'
  teacher_signed_at TIMESTAMPTZ,
  teacher_signature TEXT,
  headmaster_signed_at TIMESTAMPTZ,
  headmaster_signature TEXT,
  auto_submitted_at TIMESTAMPTZ,
  supersedes_id UUID REFERENCES {SCHEMA}.diary_entries(id), -- For corrections
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_diary_tenant ON {SCHEMA}.diary_entries(tenant_id);
CREATE INDEX IF NOT EXISTS idx_diary_teacher_date ON {SCHEMA}.diary_entries(teacher_id, entry_date);
CREATE INDEX IF NOT EXISTS idx_diary_class_date ON {SCHEMA}.diary_entries(class_grade, class_section, entry_date);
CREATE INDEX IF NOT EXISTS idx_diary_state ON {SCHEMA}.diary_entries(lifecycle_state);
CREATE INDEX IF NOT EXISTS idx_diary_date ON {SCHEMA}.diary_entries(entry_date);

-- Daily registers (aggregated view for HM/MEO/DEO)
CREATE TABLE IF NOT EXISTS {SCHEMA}.daily_registers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id),
  school_id UUID NOT NULL REFERENCES {SCHEMA}.schools(id),
  register_date DATE NOT NULL,
  class_grade TEXT NOT NULL,
  class_section TEXT NOT NULL,
  subject TEXT NOT NULL,
  teacher_id UUID REFERENCES {SCHEMA}.users(id),
  entry_id UUID REFERENCES {SCHEMA}.diary_entries(id),
  status TEXT DEFAULT 'draft', -- 'draft', 'signed_teacher', 'signed_both', 'auto_locked', 'rejected'
  teacher_signed_at TIMESTAMPTZ,
  headmaster_signed_at TIMESTAMPTZ,
  meo_signed_at TIMESTAMPTZ,
  deo_signed_at TIMESTAMPTZ,
  rejection_reason TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(school_id, register_date, class_grade, class_section, subject)
);

CREATE INDEX IF NOT EXISTS idx_register_tenant ON {SCHEMA}.daily_registers(tenant_id);
CREATE INDEX IF NOT EXISTS idx_register_school_date ON {SCHEMA}.daily_registers(school_id, register_date);
CREATE INDEX IF NOT EXISTS idx_register_status ON {SCHEMA}.daily_registers(status);

-- Capsule audit log (immutable)
CREATE TABLE IF NOT EXISTS {SCHEMA}.capsule_audit (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id),
  capsule_id TEXT NOT NULL,
  from_state TEXT,
  to_state TEXT NOT NULL,
  actor TEXT NOT NULL, -- 'teacher', 'headmaster', 'system', 'meo', 'deo'
  actor_id TEXT, -- phone or tdx_id
  signature TEXT, -- Ed25519 signature or 'auto'
  flags_snapshot JSONB,
  ip_address INET,
  user_agent TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_tenant ON {SCHEMA}.capsule_audit(tenant_id);
CREATE INDEX IF NOT EXISTS idx_audit_capsule ON {SCHEMA}.capsule_audit(capsule_id);
CREATE INDEX IF NOT EXISTS idx_audit_actor ON {SCHEMA}.capsule_audit(actor_id);
CREATE INDEX IF NOT EXISTS idx_audit_created ON {SCHEMA}.capsule_audit(created_at);

-- Teacher enrollment for zero-effort mode
CREATE TABLE IF NOT EXISTS {SCHEMA}.teacher_enrollments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id),
  teacher_id UUID NOT NULL REFERENCES {SCHEMA}.users(id),
  school_id UUID REFERENCES {SCHEMA}.schools(id),
  class_grade TEXT NOT NULL,
  class_section TEXT NOT NULL,
  subject TEXT NOT NULL,
  enrolled_date DATE NOT NULL DEFAULT CURRENT_DATE,
  unenrolled_date DATE,
  status TEXT DEFAULT 'active', -- 'active', 'paused', 'ended'
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(teacher_id, class_grade, class_section, subject, enrolled_date)
);

CREATE INDEX IF NOT EXISTS idx_enrollment_tenant ON {SCHEMA}.teacher_enrollments(tenant_id);
CREATE INDEX IF NOT EXISTS idx_enrollment_teacher ON {SCHEMA}.teacher_enrollments(teacher_id, status);

-- Login OTPs
CREATE TABLE IF NOT EXISTS {SCHEMA}.login_otps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id),
  phone TEXT NOT NULL,
  otp_hash TEXT NOT NULL,
  purpose TEXT DEFAULT 'login', -- 'login', 'register', 'verify'
  attempts INTEGER DEFAULT 0,
  expires_at TIMESTAMPTZ NOT NULL,
  consumed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_otp_phone ON {SCHEMA}.login_otps(phone, purpose);
CREATE INDEX IF NOT EXISTS idx_otp_expires ON {SCHEMA}.login_otps(expires_at);

-- Web registrations
CREATE TABLE IF NOT EXISTS {SCHEMA}.web_registrations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id),
  name TEXT NOT NULL,
  phone TEXT NOT NULL,
  email TEXT,
  school_name TEXT,
  school_udise TEXT,
  subject TEXT,
  otp_verified BOOLEAN DEFAULT FALSE,
  invitation_token TEXT,
  status TEXT DEFAULT 'pending', -- 'pending', 'approved', 'rejected', 'converted'
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_webreg_tenant ON {SCHEMA}.web_registrations(tenant_id);
CREATE INDEX IF NOT EXISTS idx_webreg_phone ON {SCHEMA}.web_registrations(phone);

-- Billing links
CREATE TABLE IF NOT EXISTS {SCHEMA}.billing_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id),
  teacher_id UUID REFERENCES {SCHEMA}.users(id),
  amount INTEGER NOT NULL, -- in paise
  currency TEXT DEFAULT 'INR',
  plan TEXT, -- 'monthly', 'quarterly', 'yearly'
  razorpay_link_id TEXT,
  razorpay_link_url TEXT,
  status TEXT DEFAULT 'created', -- 'created', 'paid', 'expired', 'cancelled'
  expires_at TIMESTAMPTZ,
  paid_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_billing_tenant ON {SCHEMA}.billing_links(tenant_id);
CREATE INDEX IF NOT EXISTS idx_billing_teacher ON {SCHEMA}.billing_links(teacher_id);
CREATE INDEX IF NOT EXISTS idx_billing_status ON {SCHEMA}.billing_links(status);

-- Payments
CREATE TABLE IF NOT EXISTS {SCHEMA}.payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id),
  billing_link_id UUID REFERENCES {SCHEMA}.billing_links(id),
  teacher_id UUID REFERENCES {SCHEMA}.users(id),
  razorpay_payment_id TEXT,
  razorpay_order_id TEXT,
  amount INTEGER NOT NULL,
  currency TEXT DEFAULT 'INR',
  status TEXT, -- 'captured', 'failed', 'refunded'
  method TEXT,
  metadata JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_payments_tenant ON {SCHEMA}.payments(tenant_id);
CREATE INDEX IF NOT EXISTS idx_payments_link ON {SCHEMA}.payments(billing_link_id);

-- Members (Founding 1000)
CREATE TABLE IF NOT EXISTS {SCHEMA}.members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id),
  teacher_id UUID NOT NULL REFERENCES {SCHEMA}.users(id),
  member_number INTEGER NOT NULL,
  invited_by UUID REFERENCES {SCHEMA}.users(id),
  invitation_code TEXT,
  status TEXT DEFAULT 'active', -- 'active', 'expired', 'revoked'
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(tenant_id, member_number)
);

CREATE INDEX IF NOT EXISTS idx_members_tenant ON {SCHEMA}.members(tenant_id);
CREATE INDEX IF NOT EXISTS idx_members_teacher ON {SCHEMA}.members(teacher_id);
`;

/**
 * Generate SQL for creating tenant schema
 */
function generateTenantSchemaSQL(tenantId, isolationStrategy) {
  if (isolationStrategy === ISOLATION_STRATEGIES.SCHEMA_PER_TENANT) {
    const schemaName = `tdx_${tenantId.replace(/-/g, '_')}`;
    return `
-- Create schema for tenant ${tenantId}
CREATE SCHEMA IF NOT EXISTS ${schemaName};
GRANT USAGE ON SCHEMA ${schemaName} TO teacherdox_app;
GRANT CREATE ON SCHEMA ${schemaName} TO teacherdox_app;

-- Set search path for this session
SET search_path TO ${schemaName}, public;

${CORE_TABLES.replace(/{SCHEMA}/g, schemaName)}

-- Enable RLS for multi-tenant isolation (defense in depth)
ALTER TABLE ${schemaName}.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE ${schemaName}.schools ENABLE ROW LEVEL SECURITY;
ALTER TABLE ${schemaName}.inbound_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE ${schemaName}.outbound_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE ${schemaName}.draft_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE ${schemaName}.diary_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE ${schemaName}.daily_registers ENABLE ROW LEVEL SECURITY;
ALTER TABLE ${schemaName}.capsule_audit ENABLE ROW LEVEL SECURITY;
ALTER TABLE ${schemaName}.teacher_enrollments ENABLE ROW LEVEL SECURITY;
ALTER TABLE ${schemaName}.login_otps ENABLE ROW LEVEL SECURITY;
ALTER TABLE ${schemaName}.web_registrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE ${schemaName}.billing_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE ${schemaName}.payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE ${schemaName}.members ENABLE ROW LEVEL SECURITY;

-- RLS policies (tenant_id enforced at application level, but RLS adds safety)
CREATE POLICY tenant_isolation ON ${schemaName}.users
  USING (tenant_id = current_setting('app.current_tenant_id')::UUID);
-- Repeat for other tables...
`;
  } else {
    // Shared tables - tenant_id column provides isolation
    return CORE_TABLES.replace(/{SCHEMA}/g, 'public');
  }
}

/**
 * Migration runner for tenant onboarding
 */
class TenantMigrator {
  constructor(dbPool, isolationStrategy = ISOLATION_STRATEGIES.SCHEMA_PER_TENANT) {
    this.db = dbPool;
    this.isolationStrategy = isolationStrategy;
  }

  /**
   * Initialize database (create public schema tables)
   */
  async initialize() {
    if (this.isolationStrategy === ISOLATION_STRATEGIES.SHARED_TABLES) {
      await this.db.query(CORE_TABLES.replace(/{SCHEMA}/g, 'public'));
    }
    // For schema_per_tenant, public schema only gets tenants table
    await this.db.query(`
      CREATE TABLE IF NOT EXISTS public.tenants (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id TEXT UNIQUE NOT NULL,
        name TEXT NOT NULL,
        display_name TEXT,
        type TEXT NOT NULL DEFAULT 'demo',
        parent_tenant_id UUID REFERENCES public.tenants(id),
        subdomain TEXT UNIQUE,
        domain TEXT UNIQUE,
        config JSONB NOT NULL DEFAULT '{}',
        status TEXT NOT NULL DEFAULT 'pending',
        created_at TIMESTAMPTZ DEFAULT NOW(),
        activated_at TIMESTAMPTZ,
        suspended_at TIMESTAMPTZ,
        suspended_reason TEXT,
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);
    console.log('[TenantMigrator] Database initialized');
  }

  /**
   * Create tenant schema/tables
   */
  async createTenantSchema(tenant) {
    const sql = generateTenantSchemaSQL(tenant.config.tenantId, tenant.config.database.isolation);
    await this.db.query(sql);
    console.log(`[TenantMigrator] Created schema for tenant: ${tenant.config.tenantId}`);
  }

  /**
   * Drop tenant schema (for archival/deletion)
   */
  async dropTenantSchema(tenantId, isolationStrategy) {
    if (isolationStrategy === ISOLATION_STRATEGIES.SCHEMA_PER_TENANT) {
      const schemaName = `tdx_${tenantId.replace(/-/g, '_')}`;
      await this.db.query(`DROP SCHEMA IF EXISTS ${schemaName} CASCADE;`);
      console.log(`[TenantMigrator] Dropped schema for tenant: ${tenantId}`);
    }
    // For shared_tables, data stays but is filtered by tenant_id
  }

  /**
   * Run migrations for a specific tenant
   */
  async migrateTenant(tenant, migrations = []) {
    const schema = tenant.getSchemaName();
    const searchPath = this.isolationStrategy === ISOLATION_STRATEGIES.SCHEMA_PER_TENANT
      ? `${schema}, public`
      : 'public';

    await this.db.query(`SET search_path TO ${searchPath};`);

    for (const migration of migrations) {
      const check = await this.db.query(
        `SELECT 1 FROM public.tenant_migrations WHERE tenant_id = $1 AND migration_name = $2`,
        [tenant.config.tenantId, migration.name]
      );

      if (check.rows.length === 0) {
        console.log(`[TenantMigrator] Running migration ${migration.name} for ${tenant.config.tenantId}`);
        await this.db.query(migration.up);
        await this.db.query(
          `INSERT INTO public.tenant_migrations (tenant_id, migration_name, executed_at) VALUES ($1, $2, NOW())`,
          [tenant.config.tenantId, migration.name]
        );
      }
    }
  }

  /**
   * Get migration status for tenant
   */
  async getMigrationStatus(tenantId) {
    const result = await this.db.query(
      `SELECT migration_name, executed_at FROM public.tenant_migrations WHERE tenant_id = $1 ORDER BY executed_at`,
      [tenantId]
    );
    return result.rows;
  }
}

/**
 * Pre-defined migrations for schema evolution
 */
const MIGRATIONS = [
  {
    name: '001_add_evidence_hash_index',
    up: `
      CREATE INDEX IF NOT EXISTS idx_inbound_hash ON {SCHEMA}.inbound_messages(hash);
      CREATE INDEX IF NOT EXISTS idx_diary_hash ON {SCHEMA}.diary_entries((tdx_capsule->>'hash'));
    `,
    down: `
      DROP INDEX IF EXISTS {SCHEMA}.idx_inbound_hash;
      DROP INDEX IF EXISTS {SCHEMA}.idx_diary_hash;
    `,
  },
  {
    name: '002_add_ai_confidence_columns',
    up: `
      ALTER TABLE {SCHEMA}.draft_entries ADD COLUMN IF NOT EXISTS confidence_scores JSONB;
      ALTER TABLE {SCHEMA}.diary_entries ADD COLUMN IF NOT EXISTS confidence_scores JSONB;
    `,
    down: `
      ALTER TABLE {SCHEMA}.draft_entries DROP COLUMN IF EXISTS confidence_scores;
      ALTER TABLE {SCHEMA}.diary_entries DROP COLUMN IF EXISTS confidence_scores;
    `,
  },
  {
    name: '003_add_meta_ai_consent',
    up: `
      ALTER TABLE {SCHEMA}.users ADD COLUMN IF NOT EXISTS meta_ai_consent_at TIMESTAMPTZ;
      ALTER TABLE {SCHEMA}.users ADD COLUMN IF NOT EXISTS meta_ai_consent_version TEXT;
    `,
    down: `
      ALTER TABLE {SCHEMA}.users DROP COLUMN IF EXISTS meta_ai_consent_at;
      ALTER TABLE {SCHEMA}.users DROP COLUMN IF EXISTS meta_ai_consent_version;
    `,
  },
];

module.exports = {
  CORE_TABLES,
  generateTenantSchemaSQL,
  TenantMigrator,
  MIGRATIONS,
  ISOLATION_STRATEGIES,
};