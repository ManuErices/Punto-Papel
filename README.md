# Punto & Papel — Sistema de Gestión

ERP para librería con centro de impresiones. San Fernando, Chile.

## Stack

- React 18 + Vite
- TailwindCSS (modo oscuro con `class`)
- Firebase (Firestore + Auth + Storage)
- React Router v6
- Vercel (deploy)

## Módulos

| Módulo | Estado |
|---|---|
| Dashboard | ✅ Listo |
| Punto de venta (POS) | ✅ Listo |
| Inventario | ✅ Listo |
| Tesorería | ✅ Listo |
| Reportes | ✅ Listo |
| Compras | 🔜 Próximo sprint |

## Setup

### 1. Instalar dependencias

```bash
npm install
npm install firebase react-router-dom
npm install -D tailwindcss postcss autoprefixer
npx tailwindcss init -p
```

### 2. Configurar Firebase

1. Crear proyecto en [Firebase Console](https://console.firebase.google.com)
2. Activar **Firestore**, **Authentication** (Email/Password) y **Storage**
3. Copiar `.env.example` a `.env` y rellenar con tus credenciales:

```bash
cp .env.example .env
```

### 3. Subir reglas de Firestore

```bash
npm install -g firebase-tools
firebase login
firebase init firestore
firebase deploy --only firestore:rules
```

### 4. Crear usuarios en Firebase Console

Ve a Authentication → Users → Add user:
- `admin@puntopapel.cl` / contraseña
- `rosa@puntopapel.cl` / contraseña

Luego asigna el custom claim `role` via Firebase Admin SDK o una Cloud Function:
```js
admin.auth().setCustomUserClaims(uid, { role: 'admin' })    // para ti
admin.auth().setCustomUserClaims(uid, { role: 'operador' }) // para tu mamá
```

### 5. Correr en desarrollo

```bash
npm run dev
```

### 6. Deploy en Vercel

1. Subir repo a GitHub
2. Importar en [vercel.com](https://vercel.com)
3. Agregar las variables de entorno (las mismas del `.env`)
4. Deploy automático en cada push a `main`

## Estructura de Firestore

```
products/   — catálogo de productos
sales/      — ventas registradas
purchases/  — pedidos a proveedores (próximo sprint)
cashflow/   — movimientos de caja
config/     — configuración del negocio
```

---

Hecho con cariño para Rosa — San Fernando 💙
