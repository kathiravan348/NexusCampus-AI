from pydantic import BaseModel, Field
from typing import Optional, List, Dict, Any

class TenantCreate(BaseModel):
    name: str = Field(..., description="Institution Name e.g. Greenwood International School")
    slug: str = Field(..., description="Unique subdomain/tenant identifier e.g. greenwood")
    admin_email: str = Field(..., description="Primary administrator email")
    campus_name: Optional[str] = "Main Campus"
    country: Optional[str] = "United States"
    plan: Optional[str] = "enterprise_demo"

class TenantResponse(BaseModel):
    id: int
    name: str
    slug: str
    db_name: str
    admin_email: str
    status: str
    plan: str
    created_at: str
    message: Optional[str] = None

class TenantResetResponse(BaseModel):
    slug: str
    db_name: str
    status: str
    message: str

class StudentCreate(BaseModel):
    name: str
    email: str
    phone: Optional[str] = ""
    program: Optional[str] = "B.Sc. Computer Science & AI"
    cohort: Optional[str] = "2024-2028"
    semester: Optional[str] = "Semester 3"
    gpa: Optional[float] = 3.8
    fee_status: Optional[str] = "paid"
    advisor: Optional[str] = "Dr. Alan Turing"

class StaffCreate(BaseModel):
    name: str
    role: str
    department: str
    email: str
    salary_band: Optional[str] = "Tier 2 ($120,000)"

class InvoiceCreate(BaseModel):
    student_name: str
    fee_type: str
    amount: float
    due_date: str

class ModuleRecordCreate(BaseModel):
    name: str
    reference_code: str
    scope: str
    status: Optional[str] = "active"
    category: Optional[str] = "General"
    notes: Optional[str] = ""

class LeadScoreRequest(BaseModel):
    lead_id: str
    gpa: float
    test_score: int
    prior_interactions: int
    program_interest: str

class RAGSearchRequest(BaseModel):
    query: str
    context_scope: Optional[str] = "all_campus"
