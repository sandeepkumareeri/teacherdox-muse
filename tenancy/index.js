/**
 * tenancy/index.js — Multi-Tenancy Core Exports
 *
 * Provides:
 * - Tenant: Configuration class for multi-tenant deployments
 * - TenantRegistry: Registry and resolution for tenants
 * - Migration utilities for schema management
 */

const Tenant = require('./tenant');
const { TenantRegistry, getTenantRegistry, resetTenantRegistry } = require('./registry');
const { CORE_TABLES, TenantMigrator } = require('./migrations/schema');

module.exports = {
  Tenant,
  TenantRegistry,
  getTenantRegistry,
  resetTenantRegistry,
  CORE_TABLES,
  TenantMigrator,
};