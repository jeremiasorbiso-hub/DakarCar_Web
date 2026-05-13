const request = require('supertest');
const express = require('express');
const app = require('./server'); // Asumiendo que exportas la app

describe('API Tests', () => {
  test('GET /api/dashboard should return stats', async () => {
    const response = await request(app).get('/api/dashboard');
    expect(response.status).toBe(200);
    expect(response.body).toHaveProperty('stats');
  });

  test('POST /api/clientes with valid data', async () => {
    const response = await request(app).post('/api/clientes').send({
      nombre: 'Test Client',
      telefono: '123456789',
    });
    expect(response.status).toBe(201);
  });

  test('POST /api/clientes with invalid data', async () => {
    const response = await request(app).post('/api/clientes').send({
      nombre: '',
      telefono: '',
    });
    expect(response.status).toBe(400);
  });
});
