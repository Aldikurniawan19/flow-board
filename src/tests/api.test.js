// @vitest-environment node
import crypto from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createDatabase } from '../../server/db.js';
import { createApp } from '../../server/app.js';

const CSRF = { 'X-Requested-With': 'FlowBoard' };

describe('Auth & Boards API (Happy path, validation, & anti-IDOR security)', () => {
  /** @type {import('../../server/db.js').FlowBoardDb} */
  let db;
  /** @type {import('express').Express} */
  let app;

  beforeEach(async () => {
    db = await createDatabase(':memory:');
    app = createApp({ db, enableRateLimit: false });
  });

  afterEach(async () => {
    await db.close();
  });

  it('registers, authenticates, persists boards, and revokes session on logout', async () => {
    const agent = request.agent(app);

    const reg = await agent.post('/api/auth/register').set(CSRF).send({
      name: 'Budi Santoso',
      email: 'budi@example.com',
      password: 'PasswordKuat123',
    });
    expect(reg.status).toBe(201);
    expect(reg.body.user.email).toBe('budi@example.com');
    expect(reg.headers['set-cookie']?.[0]).toContain('HttpOnly');

    const me = await agent.get('/api/auth/me');
    expect(me.status).toBe(200);
    expect(me.body.user.name).toBe('Budi Santoso');

    const listRes = await agent.get('/api/boards');
    expect(listRes.status).toBe(200);
    expect(listRes.body.boards).toHaveLength(1);

    const createRes = await agent.post('/api/boards').set(CSRF).send({
      title: 'Diagram DFD Penjualan',
      elements: [
        {
          id: 'el-1',
          type: 'dfd_gs_process',
          x: 100,
          y: 120,
          width: 160,
          height: 90,
          strokeColor: '#0F172A',
          fillColor: '#DBEAFE',
          strokeWidth: 2,
          strokeStyle: 'solid',
          roughness: 0,
          opacity: 1,
          seed: 42,
          code: '1.0',
          text: 'Proses Order',
        },
      ],
    });
    expect(createRes.status).toBe(201);
    const boardId = createRes.body.board.id;

    const updateRes = await agent.put(`/api/boards/${boardId}`).set(CSRF).send({
      title: 'Diagram DFD Penjualan v2',
    });
    expect(updateRes.status).toBe(200);
    expect(updateRes.body.board.title).toBe('Diagram DFD Penjualan v2');

    const logoutRes = await agent.post('/api/auth/logout').set(CSRF);
    expect(logoutRes.status).toBe(200);

    const afterLogout = await agent.get('/api/auth/me');
    expect(afterLogout.status).toBe(401);
  });

  it('rejects invalid inputs, duplicate emails, and missing CSRF headers', async () => {
    const noCsrf = await request(app).post('/api/auth/register').send({
      name: 'Ani',
      email: 'ani@example.com',
      password: 'Password123',
    });
    expect(noCsrf.status).toBe(403);

    const weakPwd = await request(app).post('/api/auth/register').set(CSRF).send({
      name: 'Ani',
      email: 'ani@example.com',
      password: '123',
    });
    expect(weakPwd.status).toBe(400);

    const okReg = await request(app).post('/api/auth/register').set(CSRF).send({
      name: 'Ani',
      email: 'ani@example.com',
      password: 'Password123',
    });
    expect(okReg.status).toBe(201);

    const dupReg = await request(app).post('/api/auth/register').set(CSRF).send({
      name: 'Ani Dua',
      email: 'ani@example.com',
      password: 'Password123',
    });
    expect(dupReg.status).toBe(409);

    const wrongLogin = await request(app).post('/api/auth/login').set(CSRF).send({
      email: 'ani@example.com',
      password: 'SalahPassword',
    });
    expect(wrongLogin.status).toBe(401);
  });

  it('blocks unauthenticated requests and prevents cross-user IDOR mutations', async () => {
    const unauth = await request(app).get('/api/boards');
    expect(unauth.status).toBe(401);

    const agentA = request.agent(app);
    await agentA.post('/api/auth/register').set(CSRF).send({
      name: 'User A',
      email: 'a@example.com',
      password: 'PasswordA123',
    });
    const boardA = await agentA.post('/api/boards').set(CSRF).send({
      title: 'Rahasia User A',
    });
    const boardAId = boardA.body.board.id;

    const agentB = request.agent(app);
    await agentB.post('/api/auth/register').set(CSRF).send({
      name: 'User B',
      email: 'b@example.com',
      password: 'PasswordB123',
    });

    const idorGet = await agentB.get(`/api/boards/${boardAId}`);
    expect(idorGet.status).toBe(403);

    const idorPut = await agentB.put(`/api/boards/${boardAId}`).set(CSRF).send({
      title: 'Diubah User B',
    });
    expect(idorPut.status).toBe(403);

    const idorDel = await agentB.delete(`/api/boards/${boardAId}`).set(CSRF);
    expect(idorDel.status).toBe(403);

    // Confirm User A's board is completely untouched
    const verifyA = await agentA.get(`/api/boards/${boardAId}`);
    expect(verifyA.status).toBe(200);
    expect(verifyA.body.board.title).toBe('Rahasia User A');
  });

  it('enforces Pro/Owner access control on API keys, MCP, REST v1, and drafts with anti-IDOR isolation', async () => {
    const prevOwnerEmails = process.env.OWNER_EMAILS;
    process.env.OWNER_EMAILS = 'mcpa@example.com';

    try {
      // 1. Free user is strictly blocked (403) from creating API keys, drafts, or calling MCP tools
      const agentFree = request.agent(app);
      const freeReg = await agentFree.post('/api/auth/register').set(CSRF).send({
        name: 'User Free',
        email: 'free@example.com',
        password: 'PasswordF123',
      });
      expect(freeReg.status).toBe(201);
      expect(freeReg.body.user.plan).toBe('free');
      expect(freeReg.body.user.hasAiAccess).toBe(false);

      const freeKeyAttempt = await agentFree.post('/api/keys').set(CSRF).send({ name: 'Blocked Key' });
      expect(freeKeyAttempt.status).toBe(403);
      expect(freeKeyAttempt.body.code).toBe('PRO_REQUIRED');

      // Free user & unauthenticated callers are strictly blocked from Pro tidy endpoint
      const unauthTidy = await request(app).post('/api/boards/tidy').set(CSRF).send({
        mode: 'full',
        elements: [],
      });
      expect(unauthTidy.status).toBe(401);

      const freeTidy = await agentFree.post('/api/boards/tidy').set(CSRF).send({
        mode: 'full',
        elements: [],
      });
      expect(freeTidy.status).toBe(403);
      expect(freeTidy.body.code).toBe('PRO_REQUIRED');

      const freeDraftAttempt = await agentFree.post('/api/public/drafts').send({
        title: 'Blocked Draft',
        code: '@startuml\nentity A {\n* id <<PK>>\n}\n@enduml',
      });
      expect(freeDraftAttempt.status).toBe(403);

      const unauthDraftAttempt = await request(app).post('/api/public/drafts').send({
        title: 'Unauth Draft',
        code: '@startuml\nentity A {\n* id <<PK>>\n}\n@enduml',
      });
      expect(unauthDraftAttempt.status).toBe(401);

      // Unauthenticated MCP request returns 401 + RFC 9728 WWW-Authenticate so OAuth clients trigger login
      const unauthMcpGen = await request(app)
        .post('/api/mcp')
        .send({
          jsonrpc: '2.0',
          id: 99,
          method: 'tools/call',
          params: {
            name: 'generate_diagram',
            arguments: { title: 'Blocked Guest', code: '@startuml\nentity A\n@enduml' },
          },
        });
      expect(unauthMcpGen.status).toBe(401);
      expect(unauthMcpGen.headers['www-authenticate']).toContain(
        '/.well-known/oauth-protected-resource',
      );

      // 2. Owner account (via server-side OWNER_EMAILS) automatically has full AI/MCP access
      const agentA = request.agent(app);
      const regA = await agentA.post('/api/auth/register').set(CSRF).send({
        name: 'Owner MCP A',
        email: 'mcpa@example.com',
        password: 'PasswordA123',
      });
      expect(regA.status).toBe(201);
      expect(regA.body.user.isOwner).toBe(true);
      expect(regA.body.user.hasAiAccess).toBe(true);

      // 3. Separate Pro user B (upgraded in DB) also gets access, with strict anti-IDOR isolation
      const agentB = request.agent(app);
      const regB = await agentB.post('/api/auth/register').set(CSRF).send({
        name: 'Pro User B',
        email: 'mcpb@example.com',
        password: 'PasswordB123',
      });
      expect(regB.body.user.hasAiAccess).toBe(false);
      await db.run('UPDATE users SET plan = ? WHERE email = ?', ['pro', 'mcpb@example.com']);

      // Create personal API keys for Owner A and Pro User B
      const keyResA = await agentA.post('/api/keys').set(CSRF).send({ name: 'Claude Desktop' });
      expect(keyResA.status).toBe(201);
      expect(keyResA.body.secret).toMatch(/^fbk_[a-f0-9]{48}$/);
      const secretA = keyResA.body.secret;
      const keyIdA = keyResA.body.apiKey.id;

      const keyResB = await agentB.post('/api/keys').set(CSRF).send({ name: 'Cursor B' });
      expect(keyResB.status).toBe(201);
      const secretB = keyResB.body.secret;

      // Listing keys returns safe prefix only (never raw secret or hash)
      const listKeysA = await agentA.get('/api/keys');
      expect(listKeysA.status).toBe(200);
      expect(listKeysA.body.keys).toHaveLength(1);
      expect(listKeysA.body.keys[0].keyPrefix).toBe(secretA.slice(0, 12));
      expect(listKeysA.body.keys[0].secret).toBeUndefined();

      // User B cannot revoke User A's API key (anti-IDOR)
      const idorRevoke = await agentB.delete(`/api/keys/${keyIdA}`).set(CSRF);
      expect(idorRevoke.status).toBe(403);

      // OpenAPI 3.1.0 spec is publicly accessible
      const openApiRes = await request(app).get('/api/openapi.json');
      expect(openApiRes.status).toBe(200);
      expect(openApiRes.body.openapi).toBe('3.1.0');
      expect(openApiRes.body.paths['/api/v1/diagrams']).toBeDefined();

      // MCP initialize & tools/list
      const initRes = await request(app)
        .post('/api/mcp')
        .set('Authorization', `Bearer ${secretA}`)
        .send({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-03-26' } });
      expect(initRes.status).toBe(200);
      expect(initRes.body.result.serverInfo.name).toBe('flowboard-mcp');

      const toolsRes = await request(app)
        .post('/api/mcp')
        .set('Authorization', `Bearer ${secretA}`)
        .send({ jsonrpc: '2.0', id: 2, method: 'tools/list' });
      expect(toolsRes.status).toBe(200);
      const toolNames = toolsRes.body.result.tools.map((/** @type {any} */ t) => t.name);
      expect(toolNames).toContain('generate_diagram');
      expect(toolNames).toContain('list_boards');
      expect(toolNames).toContain('get_diagram_syntax_guide');

      // MCP authenticated generate_diagram saves directly into Owner A's account
      const dfdCode = `@startuml
title DFD Level 1 - Pengiriman Barang
rectangle "Pengirim" as E1 <<External>>
usecase "1.0\\nOrder" as P1 <<Process>>
database "D1 Resi" as D1 <<DataStore>>
E1 --> P1 : Data Paket
P1 --> D1 : Simpan Resi
@enduml`;

      const genRes = await request(app)
        .post('/api/mcp')
        .set('Authorization', `Bearer ${secretA}`)
        .send({
          jsonrpc: '2.0',
          id: 3,
          method: 'tools/call',
          params: {
            name: 'generate_diagram',
            arguments: { title: 'DFD Pengiriman AI', code: dfdCode, kind: 'dfd' },
          },
        });
      expect(genRes.status).toBe(200);
      const genPayload = genRes.body.result.structuredContent;
      expect(genPayload.storage).toBe('user_workspace');
      expect(genPayload.boardId).toBeTruthy();
      expect(genPayload.boardUrl).toContain(`/?board=${genPayload.boardId}`);
      expect(genPayload.summary.nodes).toBe(3);

      // Owner A sees the MCP-created board in their workspace
      const boardCheckA = await agentA.get(`/api/boards/${genPayload.boardId}`);
      expect(boardCheckA.status).toBe(200);
      expect(boardCheckA.body.board.title).toBe('DFD Pengiriman AI');
      expect(boardCheckA.body.board.elements.length).toBeGreaterThanOrEqual(5);

      // Owner A can run Pro tidy diagram endpoint in both full and connectors_only modes
      const tidyFull = await agentA.post('/api/boards/tidy').set(CSRF).send({
        mode: 'full',
        elements: boardCheckA.body.board.elements,
      });
      expect(tidyFull.status).toBe(200);
      expect(tidyFull.body.elements).toHaveLength(boardCheckA.body.board.elements.length);
      expect(tidyFull.body.metrics.mode).toBe('full');

      const tidyConnOnly = await agentA.post('/api/boards/tidy').set(CSRF).send({
        mode: 'connectors_only',
        elements: boardCheckA.body.board.elements,
      });
      expect(tidyConnOnly.status).toBe(200);
      expect(tidyConnOnly.body.metrics.mode).toBe('connectors_only');

      // Pro User B's API key CANNOT read or delete Owner A's board via MCP (anti-IDOR)
      const idorMcpGet = await request(app)
        .post('/api/mcp')
        .set('Authorization', `Bearer ${secretB}`)
        .send({
          jsonrpc: '2.0',
          id: 4,
          method: 'tools/call',
          params: { name: 'get_board', arguments: { boardId: genPayload.boardId } },
        });
      expect(idorMcpGet.status).toBe(200);
      expect(idorMcpGet.body.result.isError).toBe(true);

      // Authenticated Owner A can create & fetch drafts via Bearer API key
      const draftCreate = await request(app)
        .post('/api/public/drafts')
        .set('Authorization', `Bearer ${secretA}`)
        .send({ title: 'Draft Owner AI', code: dfdCode, kind: 'dfd' });
      expect(draftCreate.status).toBe(201);
      const draftRes = await request(app)
        .get(`/api/public/drafts/${draftCreate.body.draftId}`)
        .set('Authorization', `Bearer ${secretA}`);
      expect(draftRes.status).toBe(200);
      expect(draftRes.body.draft.title).toBe('Draft Owner AI');

      // REST v1 endpoint works with Owner Bearer key and rejects invalid key
      const v1Create = await request(app)
        .post('/api/v1/diagrams')
        .set('Authorization', `Bearer ${secretA}`)
        .send({
          title: 'ERD Chen via REST',
          code: 'entity A {\n * id <<PK>>\n}\nentity B {\n * id <<PK>>\n}\nA "1" -- "N" B : "HAS"',
          kind: 'erd_chen',
        });
      expect(v1Create.status).toBe(201);
      expect(v1Create.body.kind).toBe('erd_chen');

      const badBearer = await request(app)
        .post('/api/mcp')
        .set('Authorization', 'Bearer fbk_invalid_token_1234567890')
        .send({ jsonrpc: '2.0', id: 6, method: 'ping' });
      expect(badBearer.status).toBe(401);

      // Downgrading Pro User B back to Free immediately revokes API access (403)
      await db.run('UPDATE users SET plan = ? WHERE email = ?', ['free', 'mcpb@example.com']);
      const downgradedRest = await request(app)
        .get('/api/v1/boards')
        .set('Authorization', `Bearer ${secretB}`);
      expect(downgradedRest.status).toBe(403);
      const downgradedMcp = await request(app)
        .post('/api/mcp')
        .set('Authorization', `Bearer ${secretB}`)
        .send({ jsonrpc: '2.0', id: 7, method: 'ping' });
      expect(downgradedMcp.status).toBe(403);

      // Revoking Owner A's key immediately blocks subsequent Bearer requests
      const revokeRes = await agentA.delete(`/api/keys/${keyIdA}`).set(CSRF);
      expect(revokeRes.status).toBe(200);

      const afterRevoke = await request(app)
        .get('/api/v1/boards')
        .set('Authorization', `Bearer ${secretA}`);
      expect(afterRevoke.status).toBe(401);
    } finally {
      if (prevOwnerEmails === undefined) {
        delete process.env.OWNER_EMAILS;
      } else {
        process.env.OWNER_EMAILS = prevOwnerEmails;
      }
    }
  });

  it('supports full OAuth 2.1 + DCR + PKCE S256 + refresh rotation + revocation + anti-IDOR flow for MCP', async () => {
    const prevOwnerEmails = process.env.OWNER_EMAILS;
    process.env.OWNER_EMAILS = 'oauth-owner@example.com';

    try {
      const HOST = { Host: 'flowboard.example.test', 'X-Forwarded-Proto': 'https' };

      // 1. RFC 9728 Protected Resource Metadata & RFC 8414 Authorization Server Metadata
      const prmRoot = await request(app).get('/.well-known/oauth-protected-resource').set(HOST);
      expect(prmRoot.status).toBe(200);
      expect(prmRoot.body.resource).toBe('https://flowboard.example.test/api/mcp');
      expect(prmRoot.body.authorization_servers).toEqual(['https://flowboard.example.test']);

      const prmScoped = await request(app)
        .get('/.well-known/oauth-protected-resource/api/mcp')
        .set(HOST);
      expect(prmScoped.status).toBe(200);
      expect(prmScoped.body.resource).toBe(prmRoot.body.resource);

      const asm = await request(app).get('/.well-known/oauth-authorization-server').set(HOST);
      expect(asm.status).toBe(200);
      expect(asm.body.authorization_endpoint).toBe('https://flowboard.example.test/oauth/authorize');
      expect(asm.body.token_endpoint).toBe('https://flowboard.example.test/api/oauth/token');
      expect(asm.body.registration_endpoint).toBe('https://flowboard.example.test/api/oauth/register');
      expect(asm.body.code_challenge_methods_supported).toContain('S256');

      // 2. Dynamic Client Registration (RFC 7591): reject unsafe redirect_uris, register valid HTTPS client
      const unsafeReg = await request(app)
        .post('/api/oauth/register')
        .send({
          client_name: 'Bad Client',
          redirect_uris: ['javascript:alert(1)'],
        });
      expect(unsafeReg.status).toBe(400);
      expect(unsafeReg.body.error).toBe('invalid_redirect_uri');

      const nonLocalHttp = await request(app)
        .post('/api/oauth/register')
        .send({
          client_name: 'Insecure HTTP Client',
          redirect_uris: ['http://evil.example.com/callback'],
        });
      expect(nonLocalHttp.status).toBe(400);

      const dcrRes = await request(app)
        .post('/api/oauth/register')
        .send({
          client_name: 'Claude.ai Web',
          redirect_uris: ['https://claude.ai/api/mcp/auth_callback'],
          token_endpoint_auth_method: 'none',
        });
      expect(dcrRes.status).toBe(201);
      expect(dcrRes.body.client_id).toMatch(/^fb_cli_/);
      const clientId = dcrRes.body.client_id;
      const redirectUri = 'https://claude.ai/api/mcp/auth_callback';

      // Create Owner user, Free user, and another Pro user B
      const ownerAgent = request.agent(app);
      await ownerAgent.post('/api/auth/register').set(CSRF).send({
        name: 'OAuth Owner',
        email: 'oauth-owner@example.com',
        password: 'PasswordO123',
      });

      const freeAgent = request.agent(app);
      await freeAgent.post('/api/auth/register').set(CSRF).send({
        name: 'OAuth Free',
        email: 'oauth-free@example.com',
        password: 'PasswordF123',
      });

      const proAgentB = request.agent(app);
      await proAgentB.post('/api/auth/register').set(CSRF).send({
        name: 'OAuth Pro B',
        email: 'oauth-prob@example.com',
        password: 'PasswordB123',
      });
      await db.run('UPDATE users SET plan = ? WHERE email = ?', ['pro', 'oauth-prob@example.com']);

      const makePkce = () => {
        const verifier = crypto.randomBytes(32).toString('base64url');
        const challenge = crypto.createHash('sha256').update(verifier).digest('base64url');
        return { verifier, challenge };
      };

      // 3. Anti-Open-Redirect & CSRF & Free-user enforcement on authorize endpoints
      const pkce1 = makePkce();
      const openRedirectCheck = await ownerAgent.get(
        `/api/oauth/authorize/info?client_id=${encodeURIComponent(clientId)}&redirect_uri=${encodeURIComponent('https://evil.example.com/steal')}&response_type=code&code_challenge=${pkce1.challenge}&code_challenge_method=S256&state=s1`,
      );
      expect(openRedirectCheck.status).toBe(400);

      const noCsrfDecision = await ownerAgent.post('/api/oauth/authorize/decision').send({
        decision: 'approve',
        client_id: clientId,
        redirect_uri: redirectUri,
        response_type: 'code',
        code_challenge: pkce1.challenge,
        code_challenge_method: 'S256',
        state: 's1',
      });
      expect(noCsrfDecision.status).toBe(403);

      const freeApprove = await freeAgent
        .post('/api/oauth/authorize/decision')
        .set(CSRF)
        .send({
          decision: 'approve',
          client_id: clientId,
          redirect_uri: redirectUri,
          response_type: 'code',
          code_challenge: pkce1.challenge,
          code_challenge_method: 'S256',
          state: 's1',
        });
      expect(freeApprove.status).toBe(403);
      expect(freeApprove.body.code).toBe('PRO_REQUIRED');

      const freeDeny = await freeAgent
        .post('/api/oauth/authorize/decision')
        .set(CSRF)
        .send({
          decision: 'deny',
          client_id: clientId,
          redirect_uri: redirectUri,
          response_type: 'code',
          code_challenge: pkce1.challenge,
          code_challenge_method: 'S256',
          state: 'deny-state',
        });
      expect(freeDeny.status).toBe(200);
      expect(freeDeny.body.redirectTo).toContain('error=access_denied');
      expect(freeDeny.body.redirectTo).toContain('state=deny-state');

      // 4. Owner inspects consent info & approves (including long encrypted JWT-like state > 512 chars) -> receives authorization code
      const longState = `eyJ.${'a'.repeat(1200)}.sig`;
      const infoRes = await ownerAgent
        .get(
          `/api/oauth/authorize/info?client_id=${encodeURIComponent(clientId)}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&code_challenge=${pkce1.challenge}&code_challenge_method=S256&state=${encodeURIComponent(longState)}&resource=${encodeURIComponent('https://flowboard.example.test/api/mcp')}`,
        )
        .set(HOST);
      expect(infoRes.status).toBe(200);
      expect(infoRes.body.client.clientName).toBe('Claude.ai Web');
      expect(infoRes.body.client.redirectHost).toBe('claude.ai');
      expect(infoRes.body.state).toBe(longState);

      // Foreign RFC 8707 resource indicator must be rejected
      const foreignResource = await ownerAgent
        .get(
          `/api/oauth/authorize/info?client_id=${encodeURIComponent(clientId)}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&code_challenge=${pkce1.challenge}&code_challenge_method=S256&state=state-xyz&resource=${encodeURIComponent('https://evil.example.com/api/mcp')}`,
        )
        .set(HOST);
      expect(foreignResource.status).toBe(400);

      const approve1 = await ownerAgent
        .post('/api/oauth/authorize/decision')
        .set(HOST)
        .set(CSRF)
        .send({
          decision: 'approve',
          client_id: clientId,
          redirect_uri: redirectUri,
          response_type: 'code',
          code_challenge: pkce1.challenge,
          code_challenge_method: 'S256',
          state: longState,
          resource: 'https://flowboard.example.test/api/mcp',
        });
      expect(approve1.status).toBe(200);
      const callbackUrl1 = new URL(approve1.body.redirectTo);
      expect(callbackUrl1.searchParams.get('state')).toBe(longState);
      const authCode1 = callbackUrl1.searchParams.get('code') || '';
      expect(authCode1).toMatch(/^fbc_/);

      // 5. Token exchange via application/x-www-form-urlencoded: wrong PKCE fails, valid PKCE succeeds, replay revokes!
      const badPkceToken = await request(app)
        .post('/api/oauth/token')
        .set(HOST)
        .set('Content-Type', 'application/x-www-form-urlencoded')
        .send(
          new URLSearchParams({
            grant_type: 'authorization_code',
            client_id: clientId,
            code: authCode1,
            redirect_uri: redirectUri,
            code_verifier: 'wrong_verifier_value_that_is_at_least_43_characters_long_1234',
          }).toString(),
        );
      expect(badPkceToken.status).toBe(400);
      expect(badPkceToken.body.error).toBe('invalid_grant');

      const tokenRes1 = await request(app)
        .post('/api/oauth/token')
        .set(HOST)
        .set('Content-Type', 'application/x-www-form-urlencoded')
        .send(
          new URLSearchParams({
            grant_type: 'authorization_code',
            client_id: clientId,
            code: authCode1,
            redirect_uri: redirectUri,
            code_verifier: pkce1.verifier,
            resource: 'https://flowboard.example.test/api/mcp',
          }).toString(),
        );
      expect(tokenRes1.status).toBe(200);
      expect(tokenRes1.body.access_token).toMatch(/^fbo_/);
      expect(tokenRes1.body.refresh_token).toMatch(/^fbr_/);
      expect(tokenRes1.body.token_type).toBe('Bearer');

      // Replaying authCode1 must fail AND revoke the compromised token pair
      const replayRes = await request(app)
        .post('/api/oauth/token')
        .set(HOST)
        .set('Content-Type', 'application/x-www-form-urlencoded')
        .send(
          new URLSearchParams({
            grant_type: 'authorization_code',
            client_id: clientId,
            code: authCode1,
            redirect_uri: redirectUri,
            code_verifier: pkce1.verifier,
          }).toString(),
        );
      expect(replayRes.status).toBe(400);
      const revokedByReplay = await request(app)
        .post('/api/mcp')
        .set(HOST)
        .set('Authorization', `Bearer ${tokenRes1.body.access_token}`)
        .send({ jsonrpc: '2.0', id: 1, method: 'ping' });
      expect(revokedByReplay.status).toBe(401);

      // 6. Clean authorization -> use OAuth Bearer token on MCP -> generate diagram -> refresh rotation -> revoke
      const pkce2 = makePkce();
      const approve2 = await ownerAgent
        .post('/api/oauth/authorize/decision')
        .set(HOST)
        .set(CSRF)
        .send({
          decision: 'approve',
          client_id: clientId,
          redirect_uri: redirectUri,
          response_type: 'code',
          code_challenge: pkce2.challenge,
          code_challenge_method: 'S256',
          state: 's2',
          resource: 'https://flowboard.example.test/api/mcp',
        });
      const authCode2 = new URL(approve2.body.redirectTo).searchParams.get('code') || '';

      const tokenRes2 = await request(app)
        .post('/api/oauth/token')
        .set(HOST)
        .set('Content-Type', 'application/x-www-form-urlencoded')
        .send(
          new URLSearchParams({
            grant_type: 'authorization_code',
            client_id: clientId,
            code: authCode2,
            redirect_uri: redirectUri,
            code_verifier: pkce2.verifier,
          }).toString(),
        );
      expect(tokenRes2.status).toBe(200);
      const accessToken = tokenRes2.body.access_token;
      const refreshToken = tokenRes2.body.refresh_token;

      // Call MCP generate_diagram using OAuth Bearer token
      const mcpGen = await request(app)
        .post('/api/mcp')
        .set(HOST)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          jsonrpc: '2.0',
          id: 10,
          method: 'tools/call',
          params: {
            name: 'generate_diagram',
            arguments: {
              title: 'Diagram via OAuth MCP',
              kind: 'flowchart',
              code: '@startuml\nstart\n:Login OAuth;\nstop\n@enduml',
            },
          },
        });
      expect(mcpGen.status).toBe(200);
      expect(mcpGen.body.result.structuredContent.storage).toBe('user_workspace');
      expect(mcpGen.body.result.structuredContent.title).toBe('Diagram via OAuth MCP');

      // Refresh token rotation
      const refreshRes = await request(app)
        .post('/api/oauth/token')
        .set(HOST)
        .set('Content-Type', 'application/x-www-form-urlencoded')
        .send(
          new URLSearchParams({
            grant_type: 'refresh_token',
            client_id: clientId,
            refresh_token: refreshToken,
          }).toString(),
        );
      expect(refreshRes.status).toBe(200);
      expect(refreshRes.body.access_token).toMatch(/^fbo_/);
      expect(refreshRes.body.access_token).not.toBe(accessToken);
      expect(refreshRes.body.refresh_token).not.toBe(refreshToken);

      // Old access & refresh tokens are immediately invalid after rotation
      const oldTokenCheck = await request(app)
        .post('/api/mcp')
        .set(HOST)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ jsonrpc: '2.0', id: 11, method: 'ping' });
      expect(oldTokenCheck.status).toBe(401);

      // New rotated access token works on MCP
      const newTokenCheck = await request(app)
        .post('/api/mcp')
        .set(HOST)
        .set('Authorization', `Bearer ${refreshRes.body.access_token}`)
        .send({ jsonrpc: '2.0', id: 12, method: 'ping' });
      expect(newTokenCheck.status).toBe(200);

      // Connected apps list & anti-IDOR revocation
      const connList = await ownerAgent.get('/api/oauth/connections');
      expect(connList.status).toBe(200);
      expect(connList.body.connections).toHaveLength(1);
      expect(connList.body.connections[0].clientName).toBe('Claude.ai Web');
      const connId = connList.body.connections[0].id;

      const idorRevokeConn = await proAgentB.delete(`/api/oauth/connections/${connId}`).set(CSRF);
      expect(idorRevokeConn.status).toBe(403);

      const ownerRevokeConn = await ownerAgent.delete(`/api/oauth/connections/${connId}`).set(CSRF);
      expect(ownerRevokeConn.status).toBe(200);

      const afterConnRevoke = await request(app)
        .post('/api/mcp')
        .set(HOST)
        .set('Authorization', `Bearer ${refreshRes.body.access_token}`)
        .send({ jsonrpc: '2.0', id: 13, method: 'ping' });
      expect(afterConnRevoke.status).toBe(401);
    } finally {
      if (prevOwnerEmails === undefined) {
        delete process.env.OWNER_EMAILS;
      } else {
        process.env.OWNER_EMAILS = prevOwnerEmails;
      }
    }
  });
});
