/**
 * registry.js — Tenant Registry
 *
 * Manages tenant lifecycle: creation, activation, suspension, configuration.
 * Provides tenant resolution from domain/subdomain/request.
 */

const fs = require('fs');
const path = require('path');
const { Tenant, ISOLATION_STRATEGIES } = require('./tenant.js');

class TenantRegistry {
  constructor(config = {}) {
    this.config = config;
    this.tenants = new Map(); // tenantId -> Tenant
    this.bySubdomain = new Map(); // subdomain -> tenantId
    this.byDomain = new Map(); // domain -> tenantId
    this.configPath = config.configPath || path.join(process.cwd(), 'tenancy', 'config');
    this.initialized = false;
  }

  /**
   * Initialize registry from config files
   */
  async initialize() {
    if (this.initialized) return;

    // Load from config directory
    if (fs.existsSync(this.configPath)) {
      const files = fs.readdirSync(this.configPath).filter(f => f.endsWith('.json'));
      for (const file of files) {
        try {
          const content = fs.readFileSync(path.join(this.configPath, file), 'utf8');
          const tenantConfig = JSON.parse(content);
          this.register(tenantConfig);
        } catch (err) {
          console.error(`[TenantRegistry] Failed to load ${file}:`, err.message);
        }
      }
    }

    // Always ensure a default tenant exists
    if (!this.tenants.has('default')) {
      this.createDefaultTenant();
    }

    this.initialized = true;
    console.log(`[TenantRegistry] Initialized with ${this.tenants.size} tenants`);
  }

  /**
   * Create default demo tenant
   */
  createDefaultTenant() {
    const defaultTenant = new Tenant({
      tenantId: 'default',
      name: 'TeacherDox Demo',
      displayName: 'TeacherDox Demo',
      type: 'demo',
      subdomain: 'demo',
      domain: 'demo.teacherdox.local',
      defaultLanguage: 'en',
      supportedLanguages: ['en', 'hi', 'ml', 'te'],
      database: {
        isolation: ISOLATION_STRATEGIES.SHARED_TABLES,
        host: process.env.DB_HOST || 'localhost',
        port: parseInt(process.env.DB_PORT || '5432', 10),
        name: process.env.DB_NAME || 'teacherdox',
        username: process.env.DB_USER || 'postgres',
        password: process.env.DB_PASSWORD || '',
        ssl: process.env.DB_SSL === 'true',
      },
      storage: {
        provider: 'supabase',
        bucket: process.env.SUPABASE_BUCKET || 'teacherdox',
      },
      features: {
        billing: false,
      },
      status: 'active',
    });
    this.register(defaultTenant.toJSON());
    console.log('[TenantRegistry] Created default demo tenant');
  }

  /**
   * Register a tenant
   * @param {Object|Tenant} tenantConfig
   * @returns {Tenant}
   */
  register(tenantConfig) {
    const tenant = tenantConfig instanceof Tenant ? tenantConfig : new Tenant(tenantConfig);
    const id = tenant.config.tenantId;

    if (this.tenants.has(id)) {
      throw new Error(`Tenant already exists: ${id}`);
    }

    this.tenants.set(id, tenant);
    this.bySubdomain.set(tenant.config.subdomain, id);
    if (tenant.config.domain) {
      this.byDomain.set(tenant.config.domain, id);
    }

    return tenant;
  }

  /**
   * Create and register a new tenant
   */
  create(config) {
    const tenant = new Tenant(config);
    this.register(tenant);
    this.persist(tenant);
    return tenant;
  }

  /**
   * Get tenant by ID
   */
  get(tenantId) {
    return this.tenants.get(tenantId) || null;
  }

  /**
   * Get tenant by subdomain
   */
  getBySubdomain(subdomain) {
    const id = this.bySubdomain.get(subdomain);
    return id ? this.tenants.get(id) : null;
  }

  /**
   * Get tenant by domain
   */
  getByDomain(domain) {
    const id = this.byDomain.get(domain);
    return id ? this.tenants.get(id) : null;
  }

  /**
   * Resolve tenant from request (Express middleware style)
   * Priority: subdomain > domain > header > default
   */
  resolveFromRequest(req) {
    // 1. Check subdomain (e.g., ap.teacherdox.in)
    const host = req.headers.host || '';
    const subdomain = host.split('.')[0];
    if (subdomain && subdomain !== 'www' && subdomain !== 'api') {
      const tenant = this.getBySubdomain(subdomain);
      if (tenant) return tenant;
    }

    // 2. Check full domain
    const tenant = this.getByDomain(host);
    if (tenant) return tenant;

    // 3. Check X-Tenant-ID header (for API calls)
    const headerTenantId = req.headers['x-tenant-id'];
    if (headerTenantId) {
      const tenant = this.get(headerTenantId);
      if (tenant) return tenant;
    }

    // 4. Check query param (for testing)
    if (req.query?.tenant_id) {
      const tenant = this.get(req.query.tenant_id);
      if (tenant) return tenant;
    }

    // 5. Fallback to default
    return this.get('default');
  }

  /**
   * Express middleware for tenant resolution
   */
  middleware() {
    return (req, res, next) => {
      req.tenant = this.resolveFromRequest(req);
      req.tenantId = req.tenant?.config.tenantId;
      next();
    };
  }

  /**
   * Update tenant configuration
   */
  update(tenantId, updates) {
    const tenant = this.tenants.get(tenantId);
    if (!tenant) throw new Error(`Tenant not found: ${tenantId}`);

    // Create new tenant with merged config
    const newConfig = { ...tenant.config, ...updates };
    const newTenant = new Tenant(newConfig);

    // Update maps if subdomain/domain changed
    if (newTenant.config.subdomain !== tenant.config.subdomain) {
      this.bySubdomain.delete(tenant.config.subdomain);
      this.bySubdomain.set(newTenant.config.subdomain, newTenant.config.tenantId);
    }
    if (newTenant.config.domain !== tenant.config.domain) {
      if (tenant.config.domain) this.byDomain.delete(tenant.config.domain);
      if (newTenant.config.domain) this.byDomain.set(newTenant.config.domain, newTenant.config.tenantId);
    }

    this.tenants.set(tenantId, newTenant);
    this.persist(newTenant);
    return newTenant;
  }

  /**
   * Activate tenant
   */
  activate(tenantId) {
    return this.update(tenantId, {
      status: 'active',
      activatedAt: new Date().toISOString(),
    });
  }

  /**
   * Suspend tenant
   */
  suspend(tenantId, reason = '') {
    return this.update(tenantId, {
      status: 'suspended',
      suspendedAt: new Date().toISOString(),
      suspendedReason: reason,
    });
  }

  /**
   * Archive tenant (soft delete)
   */
  archive(tenantId) {
    return this.update(tenantId, {
      status: 'archived',
    });
  }

  /**
   * Delete tenant (hard delete - use with caution)
   */
  delete(tenantId) {
    const tenant = this.tenants.get(tenantId);
    if (!tenant) return false;

    this.bySubdomain.delete(tenant.config.subdomain);
    if (tenant.config.domain) this.byDomain.delete(tenant.config.domain);
    this.tenants.delete(tenantId);

    // Remove config file
    const configFile = path.join(this.configPath, `${tenantId}.json`);
    if (fs.existsSync(configFile)) {
      fs.unlinkSync(configFile);
    }

    return true;
  }

  /**
   * Persist tenant config to file
   */
  persist(tenant) {
    if (!fs.existsSync(this.configPath)) {
      fs.mkdirSync(this.configPath, { recursive: true });
    }
    const configFile = path.join(this.configPath, `${tenant.config.tenantId}.json`);
    fs.writeFileSync(configFile, JSON.stringify(tenant.toJSON(), null, 2));
  }

  /**
   * List all tenants
   */
  list(filters = {}) {
    let tenants = Array.from(this.tenants.values());

    if (filters.status) {
      tenants = tenants.filter(t => t.config.status === filters.status);
    }
    if (filters.type) {
      tenants = tenants.filter(t => t.config.type === filters.type);
    }
    if (filters.parentTenantId) {
      tenants = tenants.filter(t => t.config.parentTenantId === filters.parentTenantId);
    }

    return tenants.map(t => t.toPublicConfig());
  }

  /**
   * Get tenant statistics
   */
  getStats() {
    const stats = {
      total: this.tenants.size,
      byStatus: {},
      byType: {},
      byIsolation: {},
    };

    for (const tenant of this.tenants.values()) {
      stats.byStatus[tenant.config.status] = (stats.byStatus[tenant.config.status] || 0) + 1;
      stats.byType[tenant.config.type] = (stats.byType[tenant.config.type] || 0) + 1;
      stats.byIsolation[tenant.config.database.isolation] = (stats.byIsolation[tenant.config.database.isolation] || 0) + 1;
    }

    return stats;
  }

  /**
   * Create child tenant (e.g., district under state)
   */
  createChild(parentTenantId, config) {
    const parent = this.tenants.get(parentTenantId);
    if (!parent) throw new Error(`Parent tenant not found: ${parentTenantId}`);

    const childConfig = {
      ...config,
      parentTenantId,
      type: config.type || 'district',
    };

    const child = this.create(childConfig);
    return child;
  }

  /**
   * Get hierarchy path (root → ... → tenant)
   */
  getHierarchy(tenantId) {
    const path = [];
    let current = this.tenants.get(tenantId);
    while (current) {
      path.unshift(current.toPublicConfig());
      current = current.config.parentTenantId ? this.tenants.get(current.config.parentTenantId) : null;
    }
    return path;
  }
}

// Singleton
let registryInstance = null;

function getTenantRegistry(config) {
  if (!registryInstance) {
    registryInstance = new TenantRegistry(config);
  }
  return registryInstance;
}

function resetTenantRegistry() {
  registryInstance = null;
}

module.exports = {
  TenantRegistry,
  getTenantRegistry,
  resetTenantRegistry,
};