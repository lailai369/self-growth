export function validateEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export function validatePassword(password: string): boolean {
  return password.length >= 6 && password.length <= 128;
}

export function validateUsername(username: string): boolean {
  return /^[a-zA-Z0-9_-]{3,30}$/.test(username);
}

export function validateSyncPath(path: string): boolean {
  // 禁止路径穿越攻击
  return !path.includes('..') && /^[\w\-\/\.]+$/.test(path);
}

export function sanitizeInput(input: string): string {
  return input.replace(/[<>'"]/g, '').trim();
}