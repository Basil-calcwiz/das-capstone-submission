import { createReadStream } from 'node:fs';
import { realpath, stat } from 'node:fs/promises';
import { createServer } from 'node:http';
import { extname, isAbsolute, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

import { DomainError } from '../domain/errors.js';
import { MockPaymentGateway } from '../lib/mockPaymentGateway.js';
import { MemoryRepository } from '../repositories/memory.js';
import { BookingService } from '../services/bookingService.js';
import { EventService } from '../services/eventService.js';
import { Router } from './router.js';

const DEFAULT_PUBLIC_DIRECTORY = fileURLToPath(new URL('../../public/', import.meta.url));
const CONTENT_TYPES = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.ico': 'image/x-icon',
  '.jpeg': 'image/jpeg',
  '.jpg': 'image/jpeg',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.txt': 'text/plain; charset=utf-8',
  '.webp': 'image/webp',
};

function sendJson(response, status, body) {
  response.writeHead(status, { 'content-type': 'application/json; charset=utf-8' });
  response.end(JSON.stringify(body));
}

function sendError(response, status, code, message) {
  sendJson(response, status, { error: { code, message } });
}

async function readJsonBody(request) {
  let text = '';
  for await (const chunk of request) {
    text += chunk;
  }
  if (!text.trim()) return {};

  try {
    return JSON.parse(text);
  } catch {
    throw new DomainError('INVALID_JSON', 'Request body must contain valid JSON');
  }
}

async function servePublicFile(response, pathname, publicDirectory, method) {
  let decodedPath;
  try {
    decodedPath = decodeURIComponent(pathname);
  } catch {
    sendError(response, 400, 'INVALID_PATH', 'The request path is invalid');
    return;
  }

  const root = resolve(publicDirectory);
  const requestedPath = resolve(root, `.${decodedPath === '/' ? '/index.html' : decodedPath}`);
  const relativePath = relative(root, requestedPath);
  if (isAbsolute(relativePath) || relativePath === '..' || relativePath.startsWith(`..${sep}`)) {
    sendError(response, 404, 'NOT_FOUND', 'File not found');
    return;
  }

  try {
    const [realRoot, realFile] = await Promise.all([realpath(root), realpath(requestedPath)]);
    const actualRelativePath = relative(realRoot, realFile);
    if (
      isAbsolute(actualRelativePath) ||
      actualRelativePath === '..' ||
      actualRelativePath.startsWith(`..${sep}`)
    ) {
      sendError(response, 404, 'NOT_FOUND', 'File not found');
      return;
    }

    const fileStats = await stat(realFile);
    if (!fileStats.isFile()) {
      sendError(response, 404, 'NOT_FOUND', 'File not found');
      return;
    }
    response.writeHead(200, {
      'content-length': fileStats.size,
      'content-type': CONTENT_TYPES[extname(realFile).toLowerCase()] ?? 'application/octet-stream',
    });
    if (method === 'HEAD') {
      response.end();
      return;
    }
    const stream = createReadStream(realFile);
    stream.on('error', () => {
      if (response.headersSent) response.destroy();
      else sendError(response, 500, 'INTERNAL_ERROR', 'An unexpected error occurred');
    });
    stream.pipe(response);
  } catch (error) {
    if (error.code === 'ENOENT' || error.code === 'ENOTDIR') {
      sendError(response, 404, 'NOT_FOUND', 'File not found');
      return;
    }
    throw error;
  }
}

export function createAppServer({
  router = new Router(),
  publicDirectory = DEFAULT_PUBLIC_DIRECTORY,
  repository = new MemoryRepository(),
  paymentGateway = new MockPaymentGateway(),
} = {}) {
  const eventService = new EventService(repository);
  const bookingService = new BookingService(repository, paymentGateway);

  if (!router.match('GET', '/health')) {
    router.get('/health', () => ({ status: 200, body: { status: 'ok' } }));
  }

  // --- BUILD 4 REST API ROUTES ---

  router.post('/api/events', async (ctx) => {
    const body = ctx?.body ?? {};
    const event = await eventService.createEvent(body);
    return { status: 201, body: { data: event } };
  });

  router.post('/api/events/:id/tiers', async (ctx) => {
    const params = ctx?.params ?? {};
    const body = ctx?.body ?? {};
    const tier = await eventService.addTier(params.id, body);
    return { status: 201, body: { data: tier } };
  });

  router.post('/api/events/:id/publish', async (ctx) => {
    const params = ctx?.params ?? {};
    const event = await eventService.publishEvent(params.id);
    return { status: 200, body: { data: event } };
  });

  router.get('/api/events', async ({ request }) => {
    const url = new URL(request.url, 'http://localhost');
    const qParams = url.searchParams;

    const maxPrice = qParams.get('maxPrice');
    const criteria = {
      q: qParams.get('q') || undefined,
      city: qParams.get('city') || undefined,
      from: qParams.get('from') || undefined,
      to: qParams.get('to') || undefined,
      maxPriceCents: maxPrice ? Number.parseInt(maxPrice, 10) : undefined,
      onlyAvailable: qParams.get('includeSoldOut') === 'false',
    };

    const sortBy = qParams.get('sort') || 'date';
    const events = await eventService.searchEvents(criteria, sortBy);

    return { status: 200, body: { data: events } };
  });

  router.post('/api/bookings', async (ctx) => {
    const request = ctx?.request;
    const body = ctx?.body ?? {};
    const userId = request?.headers?.['x-user-id'] || body.userId || 'anonymous';
    const booking = await bookingService.bookTickets({ ...body, userId });
    return { status: 201, body: { data: booking } };
  });

  router.post('/api/bookings/:reference/pay', async (ctx) => {
    const request = ctx?.request;
    const params = ctx?.params ?? {};
    const body = ctx?.body ?? {};
    const userId = request?.headers?.['x-user-id'] || body.userId || 'anonymous';
    const booking = await bookingService.payBooking({
      reference: params.reference,
      userId,
      card: body.card,
      shouldFail: body.shouldFail ?? false,
    });
    return { status: 200, body: { data: booking } };
  });

  router.post('/api/bookings/:reference/cancel', async (ctx) => {
    const request = ctx?.request;
    const params = ctx?.params ?? {};
    const body = ctx?.body ?? {};
    const userId = request?.headers?.['x-user-id'] || body.userId || 'anonymous';
    const booking = await bookingService.cancelBooking({
      reference: params.reference,
      userId,
    });
    return { status: 200, body: { data: booking } };
  });

  return createServer(async (request, response) => {
    try {
      const url = new URL(request.url, 'http://localhost');
      const route = router.match(request.method ?? 'GET', url.pathname);
      
      const body = await readJsonBody(request);

      if (route) {
        const result = await route.handler({ request, params: route.params, body });
        sendJson(response, result?.status ?? 200, result?.body ?? result ?? null);
      } else if (url.pathname === '/api' || url.pathname.startsWith('/api/')) {
        sendError(response, 404, 'NOT_FOUND', 'API route not found');
      } else if (request.method === 'GET' || request.method === 'HEAD') {
        await servePublicFile(response, url.pathname, publicDirectory, request.method);
      } else {
        sendError(response, 404, 'NOT_FOUND', 'Route not found');
      }
    } catch (error) {
      if (response.headersSent) {
        response.destroy(error);
        return;
      }
      if (error instanceof DomainError) {
        sendError(response, 400, error.code, error.message);
        return;
      }
      sendError(response, 500, 'INTERNAL_ERROR', 'An unexpected error occurred');
    }
  });
}