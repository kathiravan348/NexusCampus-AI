import os
import hashlib
import datetime
import json
from typing import Optional, List, Dict, Any
import jwt
from fastapi import APIRouter, Header, HTTPException, Depends
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from pydantic import BaseModel, Field
from ..common.db_manager import db_manager

router = APIRouter(prefix="/api/v1/auth", tags=["Authentication & Session Management"])
security = HTTPBearer(auto_error=False)

JWT_SECRET = os.getenv("JWT_SECRET", "nexuscampus_super_secure_jwt_secret_key_2026")
JWT_ALGORITHM = "HS256"
JWT_EXPIRATION_HOURS = 24
PASSWORD_SALT = "nexus_campus_salt_2026"

def hash_password(password: str) -> str:
    return hashlib.sha256(f"{PASSWORD_SALT}{password}".encode("utf-8")).hexdigest()

class LoginRequest(BaseModel):
    email: str
    password: str
    tenant_id: Optional[str] = None

class UserProfile(BaseModel):
    id: str
    name: str
    email: str
    role: str
    department: Optional[str] = None
    avatar: Optional[str] = None
    permissions: List[str] = []
    tenant_db: str

class LoginResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    expires_in_seconds: int
    user: UserProfile

@router.post("/login", response_model=LoginResponse)
async def login(payload: LoginRequest, x_tenant_id: Optional[str] = Header(None)):
    """
    Authenticates user against the active tenant database and returns a signed JWT access token.
    """
    target_tenant = payload.tenant_id or x_tenant_id
    db_name = db_manager.resolve_tenant_db(target_tenant)
    pool = await db_manager.get_async_pool(db_name)

    hashed_pw = hash_password(payload.password)

    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            "SELECT id, name, email, password_hash, role, department, avatar, permissions, status FROM users WHERE email = $1;",
            payload.email.lower().strip()
        )

        if not row:
            raise HTTPException(status_code=401, detail="Invalid email address or credentials.")

        if row["password_hash"] != hashed_pw:
            raise HTTPException(status_code=401, detail="Invalid password.")

        if row["status"] != "active":
            raise HTTPException(status_code=403, detail="Account is inactive or suspended.")

        perms = row["permissions"]
        if isinstance(perms, str):
            try:
                perms = json.loads(perms)
            except Exception:
                perms = []
        elif not isinstance(perms, list):
            perms = []

        now = datetime.datetime.now(datetime.timezone.utc)
        exp = now + datetime.timedelta(hours=JWT_EXPIRATION_HOURS)

        token_payload = {
            "sub": row["id"],
            "name": row["name"],
            "email": row["email"],
            "role": row["role"],
            "department": row["department"],
            "avatar": row["avatar"],
            "permissions": perms,
            "tenant_db": db_name,
            "iat": int(now.timestamp()),
            "exp": int(exp.timestamp())
        }

        token = jwt.encode(token_payload, JWT_SECRET, algorithm=JWT_ALGORITHM)

        return LoginResponse(
            access_token=token,
            token_type="bearer",
            expires_in_seconds=JWT_EXPIRATION_HOURS * 3600,
            user=UserProfile(
                id=row["id"],
                name=row["name"],
                email=row["email"],
                role=row["role"],
                department=row["department"],
                avatar=row["avatar"],
                permissions=perms,
                tenant_db=db_name
            )
        )

@router.get("/me", response_model=UserProfile)
async def get_current_user_profile(credentials: Optional[HTTPAuthorizationCredentials] = Depends(security)):
    """
    Validates Bearer token and returns active session user profile and permissions.
    """
    if not credentials or not credentials.credentials:
        raise HTTPException(status_code=401, detail="Missing or invalid Bearer token.")

    try:
        payload = jwt.decode(credentials.credentials, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        return UserProfile(
            id=payload["sub"],
            name=payload["name"],
            email=payload["email"],
            role=payload["role"],
            department=payload.get("department"),
            avatar=payload.get("avatar"),
            permissions=payload.get("permissions", []),
            tenant_db=payload.get("tenant_db", "nexus_default_demo")
        )
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Session expired. Please log in again.")
    except jwt.PyJWTError:
        raise HTTPException(status_code=401, detail="Invalid session token.")

@router.get("/demo-accounts")
async def get_demo_accounts():
    """
    Returns pre-configured demo persona credentials for 1-click rapid testing.
    """
    return [
        {
            "role_key": "student",
            "title": "Student",
            "name": "Emma Watson",
            "email": "student@nexuscampus.edu",
            "role": "student",
            "description": "B.Sc. Computer Science & AI (Student View)",
            "avatar": "https://api.dicebear.com/7.x/avataaars/svg?seed=EmmaWatson",
            "badge_color": "emerald"
        },
        {
            "role_key": "teacher",
            "title": "Teacher / Faculty",
            "name": "Dr. Alan Turing",
            "email": "teacher@nexuscampus.edu",
            "role": "teacher",
            "description": "Head of CS Faculty (Grading & Course Studio)",
            "avatar": "https://api.dicebear.com/7.x/avataaars/svg?seed=AlanTuring",
            "badge_color": "blue"
        },
        {
            "role_key": "hr",
            "title": "HR Manager",
            "name": "Sarah Jenkins",
            "email": "hr@nexuscampus.edu",
            "role": "hr",
            "description": "HR Talent Acquisition & Payroll Operations",
            "avatar": "https://api.dicebear.com/7.x/avataaars/svg?seed=SarahJenkins",
            "badge_color": "purple"
        },
        {
            "role_key": "placement",
            "title": "Placement Officer",
            "name": "Marcus Vance",
            "email": "placement@nexuscampus.edu",
            "role": "placement",
            "description": "Corporate Drives & Student Placements Hub",
            "avatar": "https://api.dicebear.com/7.x/avataaars/svg?seed=MarcusVance",
            "badge_color": "amber"
        },
        {
            "role_key": "examiner",
            "title": "Chief Examiner",
            "name": "Prof. Donald Knuth",
            "email": "examiner@nexuscampus.edu",
            "role": "examiner",
            "description": "Controller of Examinations & Grade Approval",
            "avatar": "https://api.dicebear.com/7.x/avataaars/svg?seed=DonaldKnuth",
            "badge_color": "rose"
        },
        {
            "role_key": "admin",
            "title": "Super Admin",
            "name": "System Administrator",
            "email": "admin@nexuscampus.edu",
            "role": "admin",
            "description": "Unrestricted Access to All 64 Modules & Portals",
            "avatar": "https://api.dicebear.com/7.x/avataaars/svg?seed=AdminSys",
            "badge_color": "indigo"
        },
        {
            "role_key": "parent",
            "title": "Parent / Guardian",
            "name": "Arthur Watson",
            "email": "parent@nexuscampus.edu",
            "role": "parent",
            "description": "Guardian of Emma Watson (Parent Portal)",
            "avatar": "https://api.dicebear.com/7.x/avataaars/svg?seed=ArthurWatson",
            "badge_color": "teal"
        }
    ]

@router.post("/logout")
async def logout():
    return {"status": "success", "message": "Session terminated cleanly."}
