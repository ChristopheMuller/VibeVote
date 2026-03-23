import express from 'express';

export const getAccessToken = (req: express.Request) => {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    return authHeader.substring(7);
  }
  return (req as any).session?.accessToken;
};
