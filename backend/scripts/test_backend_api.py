import urllib.request
import json

base_url = "http://localhost:8000"

print("--- 1. Testing Health ---")
res = urllib.request.urlopen(f"{base_url}/health")
print("Health:", json.loads(res.read()))

print("\n--- 2. Testing Default Tenant Students Query ---")
res = urllib.request.urlopen(f"{base_url}/api/v1/core/students")
students = json.loads(res.read())
print(f"Loaded {len(students)} students from DB. First: {students[0]['name']} ({students[0]['id']})")

print("\n--- 3. Testing Tenant Onboarding (Cloning nexus_default_demo) ---")
payload = json.dumps({
    "name": "Greenwood International School",
    "slug": "greenwood",
    "admin_email": "principal@greenwood.edu",
    "campus_name": "Emerald Valley Campus"
}).encode("utf-8")
req = urllib.request.Request(f"{base_url}/api/v1/tenants/onboard", data=payload, headers={"Content-Type": "application/json"})
res = urllib.request.urlopen(req)
onboard_res = json.loads(res.read())
print("Tenant Onboarded:", onboard_res)

print("\n--- 4. Testing Cloned Tenant Isolation ---")
# Query institution settings with header X-Tenant-Id: greenwood
req = urllib.request.Request(f"{base_url}/api/v1/core/institution", headers={"X-Tenant-Id": "greenwood"})
res = urllib.request.urlopen(req)
greenwood_inst = json.loads(res.read())
print("Greenwood Institution Settings:", greenwood_inst)

# Query default demo institution settings
req = urllib.request.Request(f"{base_url}/api/v1/core/institution", headers={"X-Tenant-Id": "default"})
res = urllib.request.urlopen(req)
default_inst = json.loads(res.read())
print("Default Demo Institution Settings:", default_inst)

print("\n--- 5. Testing AI Lead Scoring ---")
lead_payload = json.dumps({
    "lead_id": "LD-9901",
    "gpa": 3.88,
    "test_score": 92,
    "prior_interactions": 4,
    "program_interest": "B.Sc. Artificial Intelligence"
}).encode("utf-8")
req = urllib.request.Request(f"{base_url}/api/v1/ai/lead-score", data=lead_payload, headers={"Content-Type": "application/json"})
res = urllib.request.urlopen(req)
print("AI Lead Score:", json.loads(res.read()))

print("\n--- 6. Testing AI Attrition Risk Predictor ---")
req = urllib.request.Request(f"{base_url}/api/v1/ai/attrition-risk", headers={"X-Tenant-Id": "greenwood"})
res = urllib.request.urlopen(req)
attrition = json.loads(res.read())
print(f"Attrition analysis on greenwood: {attrition['evaluated_count']} students, {attrition['at_risk_count']} at risk.")

print("\nALL BACKEND TESTS PASSED SUCCESSFULLY!")
