// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createDatabase } from '../../server/db.js';
import { createApp } from '../../server/app.js';

const CSRF = { 'X-Requested-With': 'FlowBoard' };

describe('Auth & Boards API (Happy path, validation, & anti-IDOR security)', () => {
  /** @type {import('node:sqlite').DatabaseSync} */
  let db;
  /** @type {import('express').Express} */
  let app;

  beforeEach(() => {
    db = createDatabase(':memory:');
    app = createApp({ db, enableRateLimit: false });
  });

  afterEach(() => {
    db.close();
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
});
