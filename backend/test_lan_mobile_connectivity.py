"""
Automated Test for LAN Mobile Network Connectivity
Verifies that all API endpoints are accessible through the laptop's LAN IP (http://192.168.1.21:5174/api/)
simulating exactly what a mobile device experiences over the Wi-Fi network.
"""
import urllib.request
import urllib.error
import json
import uuid
import re

import socket

def _detect_lan_ip():
    try:
        hostname = socket.gethostname()
        for ip in socket.gethostbyname_ex(hostname)[2]:
            if not ip.startswith('127.') and not ip.startswith('169.254.'):
                return ip
    except Exception:
        pass
    return '127.0.0.1'

BASE_LAN_URL = f"http://{_detect_lan_ip()}:5174/api"

def make_request(path, method="GET", data=None, token=None):
    url = f"{BASE_LAN_URL}{path}"
    headers = {"Content-Type": "application/json"}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    body = json.dumps(data).encode('utf-8') if data else None
    req = urllib.request.Request(url, data=body, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=20) as res:
            return res.status, json.loads(res.read().decode('utf-8'))
    except urllib.error.HTTPError as e:
        err_body = e.read().decode('utf-8')
        try:
            return e.code, json.loads(err_body)
        except Exception:
            return e.code, err_body
    except Exception as e:
        return 0, str(e)


def run_lan_tests():
    print("=" * 80)
    print(f"TESTING LAN MOBILE CONNECTIVITY VIA {BASE_LAN_URL}")
    print("=" * 80)

    # 1. Health Check
    status_code, body = make_request("/health/")
    print(f"\n[1] Health Check: Status {status_code}")
    assert status_code == 200, f"Expected 200, got {status_code}: {body}"
    assert body.get("status") == "ok", f"Expected ok: {body}"
    print(f"    -- OK: Backend responds through LAN IP via Vite proxy!")

    # 2. Public Registration
    suffix = uuid.uuid4().hex[:6]
    test_email = f"mobile_test_{suffix}@campus.edu"
    test_password = "MobilePassword123!"
    reg_payload = {
        "name": "Mobile Tester",
        "email": test_email,
        "password": test_password,
        "role": "STUDENT",
        "phone": f"987{uuid.uuid4().int % 10000000:07d}"
    }
    status_code, reg_body = make_request("/auth/register/", method="POST", data=reg_payload)
    print(f"\n[2] User Registration: Status {status_code}")
    assert status_code == 201, f"Expected 201, got {status_code}: {reg_body}"
    access_token = reg_body.get("access")
    refresh_token = reg_body.get("refresh")
    assert access_token and refresh_token, "Tokens must be returned on registration"
    print(f"    -- OK: Registered user {test_email} through LAN IP!")

    # 3. Profile Fetch via JWT
    status_code, profile_body = make_request("/auth/me/", method="GET", token=access_token)
    print(f"\n[3] Authenticated Profile (/auth/me/): Status {status_code}")
    assert status_code == 200, f"Expected 200, got {status_code}: {profile_body}"
    assert profile_body.get("email") == test_email
    print(f"    -- OK: Authenticated requests succeed across LAN IP!")

    # 4. User Login
    login_payload = {
        "email": test_email,
        "password": test_password
    }
    status_code, login_body = make_request("/auth/login/", method="POST", data=login_payload)
    print(f"\n[4] User Login (/auth/login/): Status {status_code}")
    assert status_code == 200, f"Expected 200, got {status_code}: {login_body}"
    new_access = login_body.get("access")
    assert new_access, "Access token must be returned on login"
    print(f"    -- OK: Login succeeds over LAN IP!")

    # 5. Logout & Blacklist
    logout_payload = {
        "refresh": refresh_token
    }
    status_code, logout_body = make_request("/auth/logout/", method="POST", data=logout_payload, token=new_access)
    print(f"\n[5] User Logout (/auth/logout/): Status {status_code}")
    assert status_code == 200, f"Expected 200, got {status_code}: {logout_body}"
    print(f"    -- OK: Logout succeeds over LAN IP!")

    # 6. Cleanup test user
    import django
    import os
    os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')
    django.setup()
    from django.contrib.auth import get_user_model
    User = get_user_model()
    User.objects.filter(email=test_email).delete()

    print("\n" + "=" * 80)
    print("ALL LAN MOBILE CONNECTIVITY TESTS PASSED (100%)!")
    print("=" * 80)


if __name__ == '__main__':
    run_lan_tests()
