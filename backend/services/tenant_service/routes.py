from fastapi import APIRouter, HTTPException
from ..common.models import TenantCreate, TenantResponse, TenantResetResponse
from ..common.db_manager import db_manager

router = APIRouter(prefix="/api/v1/tenants", tags=["Tenant Onboarding & Provisioning"])

@router.post("/onboard", response_model=TenantResponse)
async def onboard_customer_tenant(payload: TenantCreate):
    """
    Onboards a new customer tenant by instantaneously cloning the master demo template (nexus_default_demo).
    The template remains completely immutable and untouched.
    """
    try:
        new_db_name = db_manager.clone_template_db(
            slug=payload.slug,
            institution_name=payload.name,
            admin_email=payload.admin_email
        )
        
        # Retrieve registered tenant record from master
        all_tenants = db_manager.list_all_tenants()
        tenant_record = next((t for t in all_tenants if t["slug"] == payload.slug.lower()), None)
        
        return TenantResponse(
            id=tenant_record["id"] if tenant_record else 1,
            name=payload.name,
            slug=payload.slug.lower(),
            db_name=new_db_name,
            admin_email=payload.admin_email,
            status="active",
            plan=payload.plan or "enterprise_demo",
            created_at=tenant_record["created_at"] if tenant_record else "",
            message=f"Database '{new_db_name}' provisioned and cloned from template 'nexus_default_demo'. Default demo DB remains pristine."
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to onboard tenant: {str(e)}")

@router.get("", response_model=list[dict])
async def list_tenants():
    """
    Lists all provisioned customer demo databases and the default template demo.
    """
    try:
        return db_manager.list_all_tenants()
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to list tenants: {str(e)}")

@router.post("/{slug}/reset", response_model=TenantResetResponse)
async def reset_tenant_database(slug: str):
    """
    Re-clones the customer demo database back to the pristine default demo state.
    """
    try:
        all_tenants = db_manager.list_all_tenants()
        tenant = next((t for t in all_tenants if t["slug"] == slug.lower()), None)
        if not tenant:
            raise HTTPException(status_code=404, detail=f"Tenant '{slug}' not found.")

        new_db = db_manager.clone_template_db(slug, tenant["name"], tenant["admin_email"])
        return TenantResetResponse(
            slug=slug,
            db_name=new_db,
            status="active",
            message=f"Tenant '{slug}' re-cloned from 'nexus_default_demo'."
        )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to reset tenant: {str(e)}")
