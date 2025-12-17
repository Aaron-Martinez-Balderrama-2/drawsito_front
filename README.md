### 3. 📱 front_flutter/README.md
*Este archivo va dentro de la carpeta `front_flutter`. Es técnico para desarrolladores Mobile.*

```markdown
# Frontend Mobile - Flutter App

Aplicación cliente desarrollada en Flutter. Proporciona una interfaz de usuario moderna para gestionar los recursos del sistema a través de la API REST.

## ✨ Características

* **CRUD Completo:** Capacidad para Crear, Leer, Actualizar y Eliminar registros.
* **Navegación:** Drawer lateral (Menú hamburguesa) integrado para navegación fluida entre módulos.
* **Selectores Inteligentes:** Los campos de llaves foráneas (Foreign Keys) se renderizan automáticamente como listas desplegables (Dropdowns) o buscadores, mostrando nombres legibles en lugar de IDs numéricos.
* **UI/UX:** Diseño limpio basado en Material Design 3, con feedback visual (Snackbars) para operaciones exitosas o errores.

## 📦 Dependencias Principales

* `flutter_sdk`: Framework UI.
* `http`: Para realizar peticiones REST al backend.

## ⚙️ Configuración de API

El archivo de configuración de red se encuentra en:
`lib/api.dart`

**Nota Importante:**
Si ejecuta la aplicación en un dispositivo físico (Android/iOS), asegúrese de cambiar la dirección IP `localhost` por la IP local de su servidor (ej. `192.168.0.X`).

```dart
static String base = const String.fromEnvironment('API_BASE', defaultValue: '[http://192.168.0.9:8080](http://192.168.0.9:8080)');