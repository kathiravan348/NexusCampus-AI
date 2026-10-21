import urllib.request
import json

base_url = "http://localhost:8000"

print("--- 1. Fetching Demo Accounts ---")
res = urllib.request.urlopen(f"{base_url}/api/v1/auth/demo-accounts")
accounts = json.loads(res.read())
print(f"[OK] Fetched {len(accounts)} demo personas:")
for a in accounts:
    print(f"     - {a['title']} ({a['email']}) -> Role: {a['role']}")

print("\n--- 2. Authenticating as Student (Emma Watson) ---")
payload = json.dumps({"email": "student@nexuscampus.edu", "password": "demo123"}).encode("utf-8")
req = urllib.request.Request(f"{base_url}/api/v1/auth/login", data=payload, headers={"Content-Type": "application/json"})
res = urllib.request.urlopen(req)
student_auth = json.loads(res.read())
print(f"[OK] Student login successful! Token generated ({len(student_auth['access_token'])} chars)")
print(f"     User: {student_auth['user']['name']} | Role: {student_auth['user']['role']}")
token = student_auth["access_token"]

print("\n--- 3. Verifying Session via GET /api/v1/auth/me ---")
req_me = urllib.request.Request(f"{base_url}/api/v1/auth/me", headers={"Authorization": f"Bearer {token}"})
res_me = urllib.request.urlopen(req_me)
me_data = json.loads(res_me.read())
print(f"[OK] Bearer token verified: {me_data['name']} ({me_data['email']})")
print(f"     Permissions: {me_data['permissions']}")

print("\n--- 4. Authenticating as Chief Examiner (Prof. Donald Knuth) ---")
payload = json.dumps({"email": "examiner@nexuscampus.edu", "password": "demo123"}).encode("utf-8")
req = urllib.request.Request(f"{base_url}/api/v1/auth/login", data=payload, headers={"Content-Type": "application/json"})
res = urllib.request.urlopen(req)
examiner_auth = json.loads(res.read())
print(f"[OK] Examiner login successful! User: {examiner_auth['user']['name']} | Role: {examiner_auth['user']['role']}")

print("\n--- 5. Authenticating as HR Manager (Sarah Jenkins) ---")
payload = json.dumps({"email": "hr@nexuscampus.edu", "password": "demo123"}).encode("utf-8")
req = urllib.request.Request(f"{base_url}/api/v1/auth/login", data=payload, headers={"Content-Type": "application/json"})
res = urllib.request.urlopen(req)
hr_auth = json.loads(res.read())
print(f"[OK] HR login successful! User: {hr_auth['user']['name']} | Role: {hr_auth['user']['role']}")

print("\nALL AUTH MICROSERVICE TESTS PASSED SUCCESSFULLY!")
