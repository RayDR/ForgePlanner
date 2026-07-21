# Production activation

The web client must not be activated without the API proxy and database. Run these steps with an administrator account.

1. Create a PostgreSQL role/database with a unique generated password:

```sql
CREATE ROLE northstar_planner LOGIN PASSWORD 'REPLACE_WITH_A_GENERATED_PASSWORD';
CREATE DATABASE northstar_planner OWNER northstar_planner;
```

2. Create `/etc/northstar-planner/api.env`, owned by `root:sysops`, mode `0640`, using `.env.example`. Production minimums:

```dotenv
NODE_ENV=production
PORT=4100
DATABASE_URL=postgresql://northstar_planner:URL_ENCODED_PASSWORD@127.0.0.1:5432/northstar_planner?schema=public
APP_ORIGIN=https://planner.domoforge.com
COOKIE_SECURE=true
TRUST_PROXY=true
# Generate once per environment with: openssl rand -hex 32
AI_GUEST_SESSION_SIGNING_KEY=REPLACE_WITH_A_64_CHARACTER_RANDOM_HEX_VALUE
AI_PROVIDER=mock
# Only required when AI_PROVIDER=openai; never expose it through VITE_*.
OPENAI_API_KEY=
OPENAI_PROPOSAL_MODEL=gpt-5.6-sol
OPENAI_TIMEOUT_MS=20000
```

`AI_GUEST_SESSION_SIGNING_KEY` signs the short-lived guest AI session and
proposal envelopes. It is required when `NODE_ENV=production`; the API now
fails startup rather than silently disabling the guest proposal workflow. Do
not reuse `EMAIL_ENCRYPTION_KEY`, print either value, or commit the runtime env
file.

3. Apply migrations and seed RBAC:

```bash
set -a
source /etc/northstar-planner/api.env
set +a
cd /forge/northstar-planner
npm run prisma:migrate
npm run db:seed
```

4. Install and start the service:

```bash
sudo cp deploy/northstar-planner-api.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now northstar-planner-api
curl http://127.0.0.1:4100/api/health
```

5. Add the contents of `deploy/nginx-api-location.conf` inside the HTTPS `server` block in `/etc/nginx/sites-available/planner.domoforge.com`, before `location /`. Then:

```bash
sudo nginx -t
sudo systemctl reload nginx
curl https://planner.domoforge.com/api/health
```

6. Configure Google/reCAPTCHA, when desired, with `config/auth-providers.env.example`, restart the API, and confirm `/api/auth/config`.
