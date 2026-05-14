FROM python:3.11-slim

WORKDIR /app

# Instalar dependencias del backend + cliente de Drive
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt \
    && pip install --no-cache-dir \
       google-api-python-client==2.* \
       google-auth-httplib2==0.2.*

# Copiar todo el backend (server.py + jobs/)
COPY . .

CMD ["python", "jobs/beetrak_drive_sync.py"]
