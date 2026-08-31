// 라우트 테이블 + :param 매칭 (node:http용 초경량 라우터)
export class Router {
  constructor() {
    this.routes = [];
  }

  add(method, pattern, handler) {
    const names = [];
    const regex = new RegExp(
      '^' + pattern.replace(/:[^/]+/g, (m) => { names.push(m.slice(1)); return '([^/]+)'; }) + '$',
    );
    this.routes.push({ method, regex, names, handler });
  }

  get(p, h)    { this.add('GET', p, h); }
  post(p, h)   { this.add('POST', p, h); }
  patch(p, h)  { this.add('PATCH', p, h); }
  delete(p, h) { this.add('DELETE', p, h); }

  match(method, pathname) {
    for (const route of this.routes) {
      if (route.method !== method) continue;
      const m = route.regex.exec(pathname);
      if (!m) continue;
      const params = {};
      route.names.forEach((name, i) => { params[name] = decodeURIComponent(m[i + 1]); });
      return { handler: route.handler, params };
    }
    return null;
  }
}
