export class Router {
  #routes = new Map();

  #normalizePath(path) {
    return path.replace(/\/+$/, '') || '/';
  }

  #compilePath(path) {
    const normalized = this.#normalizePath(path);
    const keys = [];
    const regexPath = normalized
      .replace(/:([^\/]+)/g, (_, key) => {
        keys.push(key);
        return '([^/]+)';
      });
    return {
      regex: new RegExp(`^${regexPath}$`),
      keys,
    };
  }

  add(method, path, handler) {
    const upperMethod = method.toUpperCase();
    const normalizedPath = this.#normalizePath(path);
    if (!this.#routes.has(upperMethod)) {
      this.#routes.set(upperMethod, []);
    }
    this.#routes.get(upperMethod).push({
      path: normalizedPath,
      compiled: this.#compilePath(normalizedPath),
      handler,
    });
  }

  get(path, handler) {
    this.add('GET', path, handler);
  }

  post(path, handler) {
    this.add('POST', path, handler);
  }

  match(method, pathname) {
    const upperMethod = method.toUpperCase();
    const normalizedPath = this.#normalizePath(pathname);
    const routes = this.#routes.get(upperMethod) || [];

    for (const route of routes) {
      const match = route.compiled.regex.exec(normalizedPath);
      if (match) {
        const params = {};
        route.compiled.keys.forEach((key, index) => {
          params[key] = decodeURIComponent(match[index + 1]);
        });
        return { handler: route.handler, params };
      }
    }
    return null;
  }
}