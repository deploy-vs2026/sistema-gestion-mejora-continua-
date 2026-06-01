# Documentación Técnica del Proyecto: SIGMC (Valdishopper)

## 1. Visión General
**SIGMC** (Sistema de Información de Gestión de Mejora Continua) es una aplicación web interna de Business Intelligence (BI) diseñada para **Valdishopper**, una operación logística de e-commerce chilena. 

Su objetivo principal es procesar, almacenar y visualizar datos operativos críticos provenientes de diferentes fuentes, como despachos (**Beetrak**), procesos de picking (**PFA**) y reportes externos (**Geosort Falabella**). La plataforma permite a los distintos roles (administradores, finanzas, mejora continua) analizar el rendimiento operativo, generar reportes financieros, auditar métricas de entrega y optimizar la toma de decisiones para la mejora continua del negocio.

---

## 2. Stack Tecnológico
El proyecto utiliza una arquitectura moderna alojada principalmente en el ecosistema de Google Cloud y Firebase.

### Frontend
*   **Librería Principal:** React (v19)
*   **Build Tool:** Vite
*   **Enrutamiento:** React Router DOM
*   **Visualización de Datos:** Recharts
*   **Manejo de Archivos:** xlsx (para lectura y procesamiento de Excel/CSV en el cliente)
*   **Estilos:** Vanilla CSS con un sistema robusto de variables CSS (Custom Properties) basado en el Brand Kit oficial de Valdishopper, sin depender de frameworks externos de UI.

### Backend & Cloud
*   **Framework de API:** FastAPI (Python)
*   **Procesamiento de Datos:** Pandas y PyArrow (para manejo de volúmenes de datos).
*   **Web Scraping / Automatización:** Playwright (Python) para extraer datos automáticamente desde portales de terceros.
*   **Infraestructura:** Google Cloud Run (para la API en vivo) y Cloud Run Jobs (para tareas programadas como el scraper de Geosort).
*   **Automatización (Cron):** Google Cloud Scheduler.

### Autenticación & Hosting
*   **Autenticación:** Firebase Auth (exclusivo para el dominio `@valdishopper.com` vía Google OAuth).
*   **Hosting Web:** Firebase Hosting.

---

## 3. Base de Datos y Almacenamiento
La aplicación no utiliza una base de datos transaccional tradicional (como PostgreSQL o MySQL), sino que emplea soluciones orientadas a la analítica masiva y al almacenamiento de objetos estáticos.

*   **Google BigQuery (Data Warehouse):** Es el motor de base de datos principal. Su propósito es actuar como el repositorio central analítico para los datos históricos de despachos (Beetrak) y picking (PFA). Se integra mediante las librerías de Google Cloud en Python. Las tablas están particionadas por fecha y clusterizadas por claves de agrupación (ej. número de orden), lo que permite consultas extremadamente rápidas y eficientes en grandes volúmenes de datos para los reportes de "Finanzas" y "Mejora Continua".
*   **Google Cloud Storage (GCS):** Utilizado como almacenamiento de objetos. Su propósito es guardar los archivos CSV procesados que se generan diariamente (ej. reportes de Geosort) y almacenar las cookies de sesión del automatizador para evitar logins repetitivos.

---

## 4. Desglose de Componentes
El sistema se compone de varios módulos interconectados:

1.  **Frontend Web App (SPA):** La interfaz de usuario donde interactúan los empleados. Incluye vistas segmentadas por rol de acceso:
    *   *Carga de Datos:* Permite subir archivos Excel/CSV de operaciones.
    *   *Mejora Continua & Finanzas:* Dashboards de visualización y exportación.
    *   *Geosort:* Interfaz de gestión para los reportes automatizados.
    *   *Admin:* Panel de control de accesos de usuarios.
2.  **API REST (Backend Cloud):** Contenedor Docker desplegado en Cloud Run que expone endpoints creados con FastAPI. Su función principal es validar, procesar (usando Pandas) y cargar (ingestar) los datos hacia BigQuery de manera segura, así como servir consultas de datos pesadas hacia el frontend.
3.  **Scraper Automatizado (Geosort):** Un proceso independiente (Cloud Run Job) impulsado por Playwright que corre todos los días a las 07:00 AM. Simula la navegación humana para descargar reportes del sistema Falabella, los limpia, cruza información y los deposita en Cloud Storage.
4.  **Capa de Identidad (Firebase):** Gestiona los accesos y roles (Admin, Master, Mejora, Finanzas) protegiendo las rutas de la aplicación para que solo personal autorizado pueda visualizar datos sensibles.

---

## 5. Importancia de cada elemento en la Arquitectura

| Componente / Tecnología | Valor que Aporta a la Arquitectura |
| :--- | :--- |
| **React + Vite** | Provee una interfaz de usuario reactiva, rápida y fluida para manipular herramientas de datos complejas en el navegador. Vite garantiza tiempos de construcción mínimos y una excelente experiencia de desarrollo. |
| **Vanilla CSS (Tokens)** | Garantiza alta fidelidad con el "Brand Kit" de Valdishopper. Al no depender de librerías de UI (ej. Bootstrap/Tailwind), el código se mantiene ligero y se ejerce control total sobre la estética corporativa (colores primarios, tipografías Montserrat y Poppins). |
| **Python + Pandas** | Fundamental para la limpieza y estructuración de los datos. Pandas facilita el cruce y agrupación de miles de filas de Excel antes de inyectarlas a la base de datos o a los dashboards. |
| **FastAPI** | Es asíncrono y muy veloz, perfecto para crear APIs robustas en Python que requieren procesar archivos binarios y realizar consultas a bases de datos en la nube concurrentemente. |
| **Google BigQuery** | **El pilar del análisis.** Permite que consultas sobre años de historial de logística (millones de filas) respondan en segundos, haciendo viables los módulos de BI sin necesidad de indexar una base SQL tradicional. |
| **Cloud Run & Scheduler** | Brinda escalabilidad automática a coste mínimo (Serverless). Cloud Run levanta los servicios bajo demanda y el Scheduler automatiza las tareas críticas de recolección de datos (Scraper) sin intervención humana. |
| **Playwright** | Resuelve la limitación de integración cuando sistemas externos (como portales B2B) no ofrecen una API. Automatiza el trabajo manual diario de forma confiable simulando un navegador real. |
| **Firebase Auth** | Delega la seguridad, encriptación y manejo de contraseñas a Google, facilitando el control de acceso corporativo (SSO) en minutos y protegiendo la información confidencial de Valdishopper. |