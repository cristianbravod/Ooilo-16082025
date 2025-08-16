@echo off
echo =====================================
echo INSTALADOR DE DEPENDENCIAS - BACKEND
echo =====================================
echo.

echo Verificando Node.js y npm...
node --version
npm --version
echo.

echo Instalando dependencias principales...
npm install express express-validator cors pg bcryptjs jsonwebtoken

echo.
echo Instalando dependencias de utilidades...
npm install multer sharp express-rate-limit helmet compression morgan dotenv

echo.
echo Instalando dependencias adicionales...
npm install joi express-async-errors uuid moment lodash

echo.
echo Instalando dependencias de desarrollo...
npm install --save-dev nodemon jest supertest @types/node

echo.
echo =====================================
echo VERIFICANDO INSTALACION...
echo =====================================

echo Verificando modulos criticos...
echo.

echo Verificando express-validator...
node -e "try { require('express-validator'); console.log('✅ express-validator: OK'); } catch(e) { console.log('❌ express-validator: FALTA'); }"

echo Verificando express...
node -e "try { require('express'); console.log('✅ express: OK'); } catch(e) { console.log('❌ express: FALTA'); }"

echo Verificando cors...
node -e "try { require('cors'); console.log('✅ cors: OK'); } catch(e) { console.log('❌ cors: FALTA'); }"

echo Verificando pg...
node -e "try { require('pg'); console.log('✅ pg: OK'); } catch(e) { console.log('❌ pg: FALTA'); }"

echo Verificando bcryptjs...
node -e "try { require('bcryptjs'); console.log('✅ bcryptjs: OK'); } catch(e) { console.log('❌ bcryptjs: FALTA'); }"

echo Verificando jsonwebtoken...
node -e "try { require('jsonwebtoken'); console.log('✅ jsonwebtoken: OK'); } catch(e) { console.log('❌ jsonwebtoken: FALTA'); }"

echo Verificando multer...
node -e "try { require('multer'); console.log('✅ multer: OK'); } catch(e) { console.log('❌ multer: FALTA'); }"

echo.
echo =====================================
echo LISTANDO DEPENDENCIAS INSTALADAS...
echo =====================================
npm list --depth=0

echo.
echo =====================================
echo INSTALACION COMPLETADA
echo =====================================
echo.
echo Para iniciar el servidor:
echo   npm start
echo.
echo Para desarrollo con auto-reload:
echo   npm run dev
echo.
pause