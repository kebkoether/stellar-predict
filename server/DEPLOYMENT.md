# Deployment Guide

## Local Development

### Prerequisites
- Node.js 18+
- npm or yarn

### Setup
```bash
npm install
cp .env.example .env
```

### Generate Settlement Keypair
```bash
# Using stellar-sdk in Node
node -e "const sdk = require('@stellar/stellar-sdk'); const kp = sdk.Keypair.random(); console.log('Public:', kp.publicKey()); console.log('Secret:', kp.secret());"
```

Add the secret key to `.env`:
```
SETTLEMENT_KEYPAIR=SBXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX
```

### Run Development Server
```bash
npm run dev
```

Server will start on http://localhost:3000
WebSocket will listen on ws://localhost:3001

### Test the API
```bash
# Create a market
curl -X POST http://localhost:3000/api/markets \
  -H "Content-Type: application/json" \
  -d '{
    "question": "Will Bitcoin exceed $100k by end of 2025?",
    "description": "Binary prediction market",
    "outcomes": ["Yes", "No"],
    "collateralCode": "USDC",
    "collateralIssuer": "GA5ZSEJYB37JRC5AVCIA5MOP4IYCGVS53UJVQ7RKSTD4P2WZDTAB47Z",
    "resolutionTime": "2025-12-31T23:59:59Z",
    "createdBy": "user123"
  }'

# List markets
curl http://localhost:3000/api/markets

# Check health
curl http://localhost:3000/api/health
```

## Testnet Deployment

### 1. Create Stellar Account
Fund an account on testnet:
```bash
# Generate keypair
node -e "const sdk = require('@stellar/stellar-sdk'); const kp = sdk.Keypair.random(); console.log('Public:', kp.publicKey()); console.log('Secret:', kp.secret());"

# Fund via friendbot
curl https://friendbot.stellar.org?addr=GXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX
```

### 2. Configure for Testnet
```env
STELLAR_NETWORK=testnet
STELLAR_HORIZON_URL=https://horizon-testnet.stellar.org
SETTLEMENT_KEYPAIR=SBXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX
USDC_ASSET_CODE=USDC
USDC_ISSUER=GA5ZSEJYB37JRC5AVCIA5MOP4IYCGVS53UJVQ7RKSTD4P2WZDTAB47Z
```

### 3. Build
```bash
npm run build
```

### 4. Deploy to VPS
```bash
# On your server
scp -r dist/ package.json .env user@server:/app/
ssh user@server "cd /app && npm ci --production"
```

### 5. Run with Process Manager (PM2)
```bash
# Install PM2 globally
npm install -g pm2

# Start application
pm2 start dist/index.js --name stellar-predict

# Monitor
pm2 monit
pm2 logs stellar-predict

# Restart on reboot
pm2 startup
pm2 save
```

## Mainnet Deployment

### Prerequisites
- Production Stellar account with funding
- Insurance/audit for smart contract equivalent
- Monitoring and alerting setup
- Backup strategy

### 1. Configure for Mainnet
```env
STELLAR_NETWORK=mainnet
STELLAR_HORIZON_URL=https://horizon.stellar.org
SETTLEMENT_KEYPAIR=SBXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX
USDC_ASSET_CODE=USDC
USDC_ISSUER=GA5Z7A42N4T43HCYCF3XQZV2DHJSHD6XDRGZFPYGUQPQMXVJKFXRXWM  # Mainnet issuer
```

### 2. Pre-Deployment Checklist
- [ ] Thoroughly tested on testnet for 2+ weeks
- [ ] Load tested with realistic concurrent orders
- [ ] Settlement pipeline tested end-to-end
- [ ] Database backups configured
- [ ] Monitoring alerts configured
- [ ] Rate limiting implemented
- [ ] DDoS protection enabled
- [ ] SSL certificates obtained
- [ ] Audit completed (if applicable)
- [ ] Insurance obtained (if applicable)

### 3. Use Reverse Proxy (Nginx)
```nginx
upstream api_backend {
    server localhost:3000;
}

upstream ws_backend {
    server localhost:3001;
}

server {
    listen 443 ssl http2;
    server_name api.stellar-predict.com;

    ssl_certificate /etc/ssl/certs/stellar-predict.crt;
    ssl_certificate_key /etc/ssl/private/stellar-predict.key;

    # Rate limiting
    limit_req_zone $binary_remote_addr zone=api_limit:10m rate=100r/s;
    limit_req_zone $binary_remote_addr zone=ws_limit:10m rate=1000r/s;

    # API endpoints
    location /api/ {
        limit_req zone=api_limit burst=200 nodelay;
        proxy_pass http://api_backend;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # WebSocket endpoint
    location /ws {
        limit_req zone=ws_limit burst=5000 nodelay;
        proxy_pass http://ws_backend;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }
}

# Redirect HTTP to HTTPS
server {
    listen 80;
    server_name api.stellar-predict.com;
    return 301 https://$server_name$request_uri;
}
```

### 4. Database Backup Strategy
```bash
# Daily backup
0 2 * * * sqlite3 /var/data/stellar-predict.db ".backup /var/backups/stellar-predict-$(date +\%Y\%m\%d).db"

# Offsite backup (AWS S3)
0 3 * * * aws s3 cp /var/backups/stellar-predict-$(date +\%Y\%m\%d).db s3://stellar-predict-backups/
```

### 5. Monitoring Setup
Using Prometheus + Grafana:

```javascript
// Add metrics middleware to Express
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - start;
    recordMetric('http_request_duration_ms', duration, {
      route: req.route?.path,
      method: req.method,
      status: res.statusCode
    });
  });
  next();
});
```

Key metrics to monitor:
- HTTP request latency (p50, p95, p99)
- WebSocket connection count
- Order matching rate (orders/sec)
- Settlement success rate
- Database query latency
- Memory usage
- CPU usage

### 6. Alerting
```yaml
# Prometheus alerting rules
alerts:
  - name: HighLatency
    condition: histogram_quantile(0.95, http_request_duration_ms) > 1000
    action: page

  - name: SettlementFailures
    condition: rate(settlement_failures[5m]) > 0.1
    action: email

  - name: DatabaseConnections
    condition: db_active_connections > 50
    action: email

  - name: DiskSpace
    condition: disk_free_bytes < 5GB
    action: page
```

## Scaling Considerations

### Single Server Limits
- ~10,000 concurrent WebSocket connections
- ~1,000 orders/second matching
- ~100MB data per 1M trades (SQLite)

### Scale to Multiple Servers

#### Architecture
```
Load Balancer (HAProxy/AWS ALB)
    ├── API Server 1 (no state, can scale)
    ├── API Server 2
    └── API Server N

    ├── WebSocket Server 1 (requires sticky sessions)
    ├── WebSocket Server 2
    └── WebSocket Server N

PostgreSQL (master-slave replication)
Redis (for order book cache)
RabbitMQ (for settlement queue)
```

#### Changes Needed
1. **Replace SQLite with PostgreSQL**
   ```typescript
   import { Pool } from 'pg';
   const db = new Pool({ connectionString });
   ```

2. **Order Book Cache in Redis**
   - Publish to Redis on every trade
   - Cache snapshots for fast retrieval
   - Cache invalidates on order changes

3. **Settlement as Separate Service**
   - Consume trades from queue
   - Independent scaling
   - Better failure isolation

4. **API Server Becomes Stateless**
   - Load balancer can distribute requests
   - No in-memory order books
   - Query from Redis cache

### Sharding by Market
For very high volume:
- Shard databases by market ID hash
- Each shard has own matching engine
- Settlement aggregates across shards

## Security in Production

### 1. Settlement Keypair
**Never** commit to repo:
```bash
# Use environment variable
export SETTLEMENT_KEYPAIR=$(aws secretsmanager get-secret-value --secret-id stellar-predict/keypair --query SecretString --output text)

# Or use HSM
# Store in hardware wallet, sign via remote API
```

### 2. API Authentication
Add JWT validation:
```typescript
import jwt from 'jsonwebtoken';

app.use((req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  try {
    req.user = jwt.verify(token, process.env.JWT_SECRET);
    next();
  } catch {
    res.status(403).json({ error: 'Invalid token' });
  }
});
```

### 3. Rate Limiting
```typescript
import rateLimit from 'express-rate-limit';

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100 // limit each IP to 100 requests per windowMs
});

app.use('/api/', limiter);
```

### 4. Input Validation
Already using Zod - ensure all endpoints validate.

### 5. Database Encryption
- Enable encryption at rest (full disk encryption)
- Use encrypted backups
- Encrypt data in transit (TLS)

### 6. DDoS Protection
- Use Cloudflare or similar
- Rate limit by IP
- Monitor for unusual patterns

## Rollback Procedure

If critical bug found:

```bash
# Health check failing
curl https://api.stellar-predict.com/api/health

# Check logs
pm2 logs stellar-predict

# Rollback
pm2 stop stellar-predict
git checkout <previous-tag>
npm run build
pm2 start dist/index.js

# Verify
curl https://api.stellar-predict.com/api/health
```

## Debugging Production

### View Recent Logs
```bash
pm2 logs stellar-predict --lines 100
```

### Check Database State
```bash
sqlite3 /var/data/stellar-predict.db
sqlite> SELECT * FROM orders WHERE status = 'open' LIMIT 5;
```

### Monitor WebSocket Connections
```bash
curl https://api.stellar-predict.com/api/admin/orderbooks
```

### Settlement Status
```bash
sqlite3 /var/data/stellar-predict.db
sqlite> SELECT status, COUNT(*) FROM settlements GROUP BY status;
```

## Incident Response

### Order Matching Issue
1. Check `/api/admin/orderbooks` for data integrity
2. Verify no orders stuck in weird states
3. Check database indices aren't corrupted
4. Restart matching engine

### Settlement Failures
1. Check Stellar network status (https://stellar.org/status)
2. Verify settlement keypair has XLM for fees
3. Check transaction fee insufficient (increase BASE_FEE)
4. Manually submit failed transactions if needed

### Database Corruption
1. Restore from backup
2. Rebuild order books from trade history
3. Notify users of any data loss

---

For more help, see README.md and ARCHITECTURE.md
