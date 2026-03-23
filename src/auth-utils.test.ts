import { describe, it, expect } from 'bun:test';
import { getAccessToken } from './auth-utils.js';
import express from 'express';

describe('getAccessToken', () => {
  it('should extract token from Bearer Authorization header', () => {
    const req = {
      headers: {
        authorization: 'Bearer sample_token_123'
      }
    } as unknown as express.Request;

    expect(getAccessToken(req)).toBe('sample_token_123');
  });

  it('should extract token from session if Authorization header is missing', () => {
    const req = {
      headers: {},
      session: {
        accessToken: 'session_token_456'
      }
    } as unknown as express.Request;

    expect(getAccessToken(req)).toBe('session_token_456');
  });

  it('should prioritize Authorization header over session token', () => {
    const req = {
      headers: {
        authorization: 'Bearer header_token'
      },
      session: {
        accessToken: 'session_token'
      }
    } as unknown as express.Request;

    expect(getAccessToken(req)).toBe('header_token');
  });

  it('should return undefined if both header and session are missing', () => {
    const req = {
      headers: {}
    } as unknown as express.Request;

    expect(getAccessToken(req)).toBeUndefined();
  });

  it('should return session token if Authorization header does not start with Bearer', () => {
    const req = {
      headers: {
        authorization: 'Basic some_other_auth'
      },
      session: {
        accessToken: 'session_token_789'
      }
    } as unknown as express.Request;

    expect(getAccessToken(req)).toBe('session_token_789');
  });

  it('should return undefined if Authorization header is not Bearer and session is missing', () => {
    const req = {
      headers: {
        authorization: 'Basic some_other_auth'
      }
    } as unknown as express.Request;

    expect(getAccessToken(req)).toBeUndefined();
  });
});
