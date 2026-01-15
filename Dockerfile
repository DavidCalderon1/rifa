# Usar una imagen ligera de Node.js
FROM node:22-alpine

# Instalar dependencias del sistema para sqlite3 (necesario en alpine)
RUN apk add --no-cache python3 make g++

# Crear directorio de la aplicación
WORKDIR /usr/src/app

# Copiar archivos de dependencias
COPY package*.json ./

# Instalar dependencias
RUN npm install && npm install -g nodemon

# Copiar el resto del código
COPY . .

# Definir que se recibirá un argumento
ARG ADMIN_PASS
# Convertir ese argumento en una variable de entorno interna
ENV ADMIN_PASS=$ADMIN_PASS

# Crear carpeta para la base de datos y asignar permisos
RUN mkdir -p /usr/src/app/data && chown -R node:node /usr/src/app/data

# Usar el usuario 'node' por seguridad
USER node

# Exponer el puerto de Express
EXPOSE 3000

# Comando para iniciar
CMD ["nodemon", "server.js"]

# Crear imagen
# docker build -t express-sqlite .

# Ejecutar contenedor
# docker run --name rifa-loteria -d -p 20099:3000 --env-file .env -v /home/david/projects/rifa:/usr/src/app -v /usr/src/app/node_modules express-sqlite:latest
