#!/usr/bin/env python3
"""End-to-end API tests for Alcove. Standard library only.

    python3 scripts/api-test.py [base_url]

Assumes `wrangler dev` is running with a local D1. Every test uses its own
cookie jar; nothing is shared with a real account. Exits 1 on the first failure.
"""

import http.cookiejar
import json
import sys
import urllib.error
import urllib.request
import uuid

BASE = (sys.argv[1] if len(sys.argv) > 1 else "http://127.0.0.1:3001").rstrip("/")
PASSED = []


class Client:
    def __init__(self):
        self.jar = http.cookiejar.CookieJar()
        self.opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(self.jar))

    def call(self, method, path, body=None, headers=None, follow=True):
        data = json.dumps(body).encode() if body is not None else None
        req = urllib.request.Request(BASE + path, data=data, method=method)
        req.add_header("user-agent", "alcove-api-test/1.0")
        if data is not None:
            req.add_header("content-type", "application/json")
        for key, value in (headers or {}).items():
            req.add_header(key, value)
        opener = self.opener if follow else urllib.request.build_opener(
            urllib.request.HTTPCookieProcessor(self.jar),
            NoRedirect(),
        )
        try:
            with opener.open(req, timeout=20) as response:
                raw = response.read()
                status = response.status
                return status, (json.loads(raw) if raw else {})
        except urllib.error.HTTPError as error:
            raw = error.read()
            try:
                payload = json.loads(raw) if raw else {}
            except json.JSONDecodeError:
                payload = {"raw": raw.decode(errors="replace")}
            return error.code, payload


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *args, **kwargs):
        return None


def check(name, condition, detail=""):
    if not condition:
        print(f"FAIL  {name}  {detail}")
        sys.exit(1)
    PASSED.append(name)
    print(f"ok    {name}")


def main():
    owner = Client()
    other = Client()
    email = f"owner-{uuid.uuid4().hex[:10]}@example.com"
    email_b = f"other-{uuid.uuid4().hex[:10]}@example.com"
    password = "correct horse battery"

    status, health = owner.call("GET", "/api/health")
    check("health responds with a bound database", status == 200 and health.get("db") is True, str(health))

    status, body = owner.call("POST", "/api/auth/signup", {"email": email, "password": password, "name": "Ada Lovelace"})
    check("signup creates a session", status == 201 and body["user"]["email"] == email, str(body))

    status, body = owner.call("GET", "/api/auth/me")
    check("session resolves to the account", status == 200 and body["user"]["name"] == "Ada Lovelace", str(body))

    status, body = owner.call("POST", "/api/auth/signup", {"email": email, "password": password})
    check("duplicate email is refused", status == 409 and body.get("field") == "email", str(body))

    status, body = owner.call("POST", "/api/auth/signup", {"email": "x@y", "password": "short"})
    check("bad signup is validated", status == 400, str(body))

    status, body = owner.call("POST", "/api/auth/login", {"email": email, "password": "wrong password"})
    check("wrong password is refused", status == 401, str(body))

    status, body = owner.call("POST", "/api/chats", {"model": "opus", "styleId": "concise", "thinking": True})
    check("chat is created", status == 201 and body["chat"]["title"] == "New chat", str(body))
    chat_id = body["chat"]["id"]

    status, body = owner.call(
        "POST", f"/api/chats/{chat_id}/messages",
        {"role": "user", "content": "Explain how a database index works"},
    )
    check("user message is stored and counted", status == 201 and body["usage"]["used"] == 1, str(body))
    check("first message names the chat", body["chat"]["title"].startswith("Explain how"), str(body["chat"]))
    first_seq = body["message"]["seq"]

    status, body = owner.call(
        "POST", f"/api/chats/{chat_id}/messages",
        {
            "role": "assistant",
            "content": "An index is a sorted side structure.",
            "thinking": "They want the mechanism.",
            "artifacts": [{
                "id": "art-test-1",
                "title": "Index notes",
                "kind": "markdown",
                "language": "markdown",
                "code": "# Index\n\nA sorted structure.",
            }],
        },
    )
    check("assistant message and artifact are stored", status == 201 and len(body["message"]["artifacts"]) == 1, str(body))

    status, body = owner.call("GET", f"/api/chats/{chat_id}")
    check("chat returns both messages in order", status == 200 and [m["role"] for m in body["messages"]] == ["user", "assistant"], str(body))

    status, body = owner.call("GET", "/api/overview")
    check("overview lists the chat and usage", status == 200 and len(body["chats"]) == 1 and body["usage"]["used"] == 1, str(body))

    status, body = owner.call("POST", f"/api/chats/{chat_id}/share")
    token = body.get("token", "")
    shared_seq = body.get("sharedSeq")
    check("share mints a token and snapshot boundary", status == 200 and len(token) == 32 and shared_seq == 2, str(body))

    status, public = owner.call("GET", f"/api/share/{token}")
    check("public link reads the snapshot without a session", status == 200 and len(public["messages"]) == 2, str(public))

    owner.call(
        "POST", f"/api/chats/{chat_id}/messages",
        {"role": "user", "content": "This message came after sharing and must stay private."},
    )
    status, public = owner.call("GET", f"/api/share/{token}")
    texts = " ".join(m["content"] for m in public["messages"])
    check("snapshot excludes later messages", status == 200 and "came after sharing" not in texts, texts)

    status, body = other.call("GET", f"/api/share/{token}")
    check("snapshot is readable by a second visitor", status == 200, str(body))

    status, body = owner.call("DELETE", f"/api/chats/{chat_id}/share")
    status_public, body_public = owner.call("GET", f"/api/share/{token}")
    check("revoking breaks the link", status == 200 and status_public == 404, str(body_public))

    status, body = owner.call("POST", "/api/projects", {"name": "Field notes", "description": "Research"})
    check("project is created", status == 201, str(body))
    project_id = body["project"]["id"]

    status, body = owner.call("POST", f"/api/projects/{project_id}/docs", {"name": "brief.md", "content": "# Brief\n\nKeep it short."})
    check("project knowledge is added", status == 201, str(body))
    doc_id = body["doc"]["id"]

    status, body = owner.call("GET", f"/api/projects/{project_id}")
    check("project returns its knowledge", status == 200 and len(body["docs"]) == 1, str(body))

    status, body = owner.call("DELETE", f"/api/projects/{project_id}/docs/{doc_id}")
    status_check, body_check = owner.call("GET", f"/api/projects/{project_id}")
    check("knowledge can be removed", status == 200 and len(body_check["docs"]) == 0, str(body_check))

    for index in range(2, 6):
        status, _ = owner.call("POST", "/api/projects", {"name": f"Project {index}"})
        check(f"project {index} is created", status == 201)

    status, body = owner.call("POST", "/api/projects", {"name": "Project 6"})
    check("free plan stops at five projects", status == 403, str(body))

    status, body = owner.call("POST", "/api/styles", {"name": "Plain brief", "description": "Terse", "instructions": "Short sentences. Lead with the answer. No adjectives."})
    check("custom style is created", status == 201, str(body))
    style_id = body["style"]["id"]

    status, body = owner.call("PATCH", f"/api/styles/{style_id}", {"name": "Plain brief v2"})
    check("custom style is editable", status == 200 and body["style"]["name"] == "Plain brief v2", str(body))

    status, body = owner.call("PUT", "/api/settings", {"theme": "dark", "fontSize": "lg", "model": "haiku", "styleId": style_id, "instructions": "Use British spelling."})
    status_check, body_check = owner.call("GET", "/api/settings")
    settings = body_check.get("settings", {})
    check("settings round-trip to the account", status == 200 and settings.get("theme") == "dark" and settings.get("styleId") == style_id, str(settings))

    status, body = owner.call("GET", "/api/export")
    check("export contains the account and its chats", status == 200 and body["account"]["email"] == email and len(body["chats"]) >= 1 and body["settings"]["theme"] == "dark", str(body)[:200])

    status, body = owner.call("GET", "/api/chats?q=index")
    check("search finds a message body", status == 200 and len(body["chats"]) == 1, str(body))

    status, body = owner.call("GET", f"/api/chats/{chat_id}", headers={"Origin": "https://evil.example"})
    check("cross-origin read is allowed but cross-origin write is not", status == 200, str(body))
    status, body = owner.call("POST", f"/api/chats/{chat_id}/messages", {"role": "user", "content": "x"}, headers={"Origin": "https://evil.example"})
    check("cross-origin mutation is refused", status == 403, str(body))

    status, body = other.call("POST", "/api/auth/signup", {"email": email_b, "password": password, "name": "Grace"})
    check("second account is created", status == 201, str(body))

    status, body = other.call("GET", f"/api/chats/{chat_id}")
    check("second account cannot read the first account's chat", status == 404, str(body))
    status, body = other.call("PATCH", f"/api/chats/{chat_id}", {"title": "stolen"})
    check("second account cannot edit it", status == 404, str(body))
    status, body = other.call("GET", f"/api/projects/{project_id}")
    check("second account cannot read the first account's project", status == 404, str(body))
    status, body = other.call("GET", "/api/overview")
    check("second account has an empty workspace", status == 200 and body["chats"] == [], str(body))

    status, body = owner.call("PATCH", "/api/account/password", {"current": password, "next": "a much better password"})
    check("password change requires the current password", status == 200, str(body))
    status, body = owner.call("POST", "/api/auth/login", {"email": email, "password": password})
    check("the old password no longer works", status == 401, str(body))
    status, body = owner.call("POST", "/api/auth/login", {"email": email, "password": "a much better password"})
    check("the new password works", status == 200, str(body))
    password = "a much better password"

    status, body = other.call("DELETE", "/api/account")
    check("second account deletes itself", status == 200, str(body))
    status, body = other.call("GET", "/api/overview")
    check("deleted account has no session", status == 401, str(body))

    status, body = owner.call("DELETE", "/api/account")
    check("first account deletes itself", status == 200, str(body))
    status, body = owner.call("GET", "/api/auth/me")
    check("deletion clears the session and data", status == 200 and body["user"] is None, str(body))

    print(f"\n{len(PASSED)} checks passed.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
