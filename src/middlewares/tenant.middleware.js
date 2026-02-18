import { Library } from "../models/library.model.js";
import { ApiError } from "../utils/ApiError.js";
import { asyncHandler } from "../utils/asyncHandler.js";

/**
 * Tenant Resolution Middleware
 *
 * Resolves tenantId for every request using (in priority order):
 *   1. JWT claim — fastest, set by verifyJWT / verifyStudentJWT after login
 *   2. X-Tenant-ID header — for API clients / mobile apps
 *   3. Subdomain — "koramangala.librarya.app" → slug lookup
 *
 * Sets req.tenantId (string) for downstream use in services.
 * Must be applied AFTER auth middleware so JWT claims are available.
 */
export const resolveTenant = asyncHandler(async (req, res, next) => {
  // 1. From JWT (set by verifyJWT / verifyStudentJWT)
  const jwtTenantId =
    req.admin?.tenantId?.toString() || req.student?.tenantId?.toString();

  if (jwtTenantId) {
    req.tenantId = jwtTenantId;
    return next();
  }

  // 2. From explicit header (API clients, mobile apps)
  const headerTenantId = req.headers["x-tenant-id"];
  if (headerTenantId) {
    req.tenantId = headerTenantId;
    return next();
  }

  // 3. From subdomain (e.g. "koramangala.librarya.app")
  const host = req.hostname || "";
  const parts = host.split(".");
  // Only treat as slug if it's a subdomain (at least 3 parts: slug.domain.tld)
  if (parts.length >= 3) {
    const slug = parts[0];
    if (slug && slug !== "www" && slug !== "api") {
      const library = await Library.findOne({ slug, isActive: true })
        .select("_id")
        .lean();
      if (library) {
        req.tenantId = library._id.toString();
        return next();
      }
    }
  }

  // No tenant resolved — reject
  throw new ApiError(
    400,
    "Tenant could not be resolved. Provide X-Tenant-ID header or use a tenant subdomain.",
  );
});

/**
 * Optional tenant resolution — does not throw if tenant cannot be resolved.
 * Use for public routes that work with or without a tenant context.
 */
export const resolveTenantOptional = asyncHandler(async (req, res, next) => {
  try {
    const jwtTenantId =
      req.admin?.tenantId?.toString() || req.student?.tenantId?.toString();
    if (jwtTenantId) {
      req.tenantId = jwtTenantId;
      return next();
    }

    const headerTenantId = req.headers["x-tenant-id"];
    if (headerTenantId) {
      req.tenantId = headerTenantId;
      return next();
    }
  } catch {
    // Swallow errors — tenant is optional
  }
  next();
});
