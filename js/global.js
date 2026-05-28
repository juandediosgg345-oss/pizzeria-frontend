// global.js — Utilidades globales: menú móvil, sesión en navbar, badge carrito, timeout empleado

// ── Helpers de ruta cross-folder ──────────────────────────────────────────────
function _prefijoNegocio() {
    return window.location.pathname.indexOf('/cliente/') !== -1 ? '../negocio/' : '';
}
function _prefijoCliente() {
    return window.location.pathname.indexOf('/negocio/') !== -1 ? '../cliente/' : '';
}

// Helper para marcar no disponible antes de salir
async function _marcarNoDisponible() {
    var emp = JSON.parse(localStorage.getItem('empleadoHawaiiana') || 'null');
    if (emp && emp.cargo === 'Repartidor' && (emp.idRepartidor || emp.idEmpleado)) {
        var idRep = emp.idRepartidor || emp.idEmpleado;
        try {
            await fetch('/api/repartidores/' + idRep + '/disponibilidad', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ estado: 'No disponible' })
            });
        } catch(e) {}
    }
}

document.addEventListener('DOMContentLoaded', function () {

    var menuBtn     = document.getElementById('btn-mobile-menu');
    var offcanvasEl = document.getElementById('menuMobile');

    if (menuBtn && offcanvasEl && !menuBtn.hasAttribute('data-bs-toggle')) {
        var bsOffcanvas = new bootstrap.Offcanvas(offcanvasEl, { backdrop: true, scroll: false });
        menuBtn.addEventListener('click', function () { bsOffcanvas.toggle(); });
    }

    if (offcanvasEl) {
        offcanvasEl.querySelectorAll('a.menu-item-movil').forEach(function (link) {
            link.addEventListener('click', function (e) {
                var href = link.getAttribute('href');
                if (!href || href === '#') return;
                e.preventDefault();
                var instance = bootstrap.Offcanvas.getInstance(offcanvasEl);
                if (instance) {
                    instance.hide();
                    setTimeout(function () { window.location.href = href; }, 320);
                } else {
                    window.location.href = href;
                }
            });
        });
    }

    var paginaActual = window.location.pathname.split('/').pop() || 'index.html';
    document.querySelectorAll('.menu-item-movil[href]').forEach(function (enlace) {
        enlace.classList.toggle('activo', enlace.getAttribute('href') === paginaActual);
    });

    mostrarSesionEnNavbar();
    actualizarBadgesGlobal();

    // Interceptar links de logout en offcanvas para que también pidan confirmación
    var offMobile = document.getElementById('menuMobile');
    if (offMobile) {
        offMobile.querySelectorAll('a.menu-item-peligro[href="empleado.html"]').forEach(function (link) {
            link.addEventListener('click', async function (e) {
                e.preventDefault();
                e.stopImmediatePropagation();
                if (confirm('¿Cerrar sesión?')) {
                    await _marcarNoDisponible();
                    localStorage.removeItem('empleadoHawaiiana');
                    window.location.href = 'empleado.html';
                }
            });
        });
    }
});

function mostrarSesionEnNavbar() {
    var cliente  = JSON.parse(localStorage.getItem('clienteHawaiiana')  || 'null');
    var empleado = JSON.parse(localStorage.getItem('empleadoHawaiiana') || 'null');
    var sesion   = cliente || empleado;

    // ── Nombre de empleado en navbar (elemento estándar en todos los paneles) ──
    if (empleado) {
        var navNombre = document.getElementById('nav-nombre-empleado');
        if (navNombre) navNombre.textContent = empleado.cargo + ': ' + empleado.nombre;
    }
    if (!sesion) return;

    var nombre  = sesion.nombre || 'Usuario';
    var destino = cliente ? _prefijoCliente() + 'micuenta.html' : _rutaEmpleado(sesion.cargo);

    var navDesktop = document.querySelector('.d-none.d-lg-flex');
    if (navDesktop) {
        var linkCuenta = navDesktop.querySelector('a[href="cuenta.html"]');
        if (linkCuenta) {
            linkCuenta.href      = destino;
            linkCuenta.innerHTML = '<i class="bi bi-person-fill"></i> ' + nombre;
            linkCuenta.title     = sesion.cargo ? 'Cargo: ' + sesion.cargo : 'Mi cuenta';
        }
        if (!navDesktop.querySelector('#btn-cerrar-sesion-nav')) {
            var btnCerrar       = document.createElement('button');
            btnCerrar.id        = 'btn-cerrar-sesion-nav';
            btnCerrar.className = 'btn btn-outline-danger btn-sm';
            btnCerrar.title     = 'Cerrar sesión';
            btnCerrar.innerHTML = '<i class="bi bi-box-arrow-right"></i>';
            btnCerrar.addEventListener('click', async function () {
                if (confirm('¿Cerrar sesión?')) {
                    await _marcarNoDisponible();
                    localStorage.removeItem('clienteHawaiiana');
                    localStorage.removeItem('empleadoHawaiiana');
                    // Logout de empleado → empleado.html / Logout de cliente → cuenta.html
                    if (empleado) {
                        window.location.href = _prefijoNegocio() + 'empleado.html';
                    } else {
                        window.location.href = _prefijoCliente() + 'cuenta.html';
                    }
                }
            });
            var btnTema = navDesktop.querySelector('#btn-tema');
            if (btnTema) navDesktop.insertBefore(btnCerrar, btnTema);
            else         navDesktop.appendChild(btnCerrar);
        }
    }

    var offcanvasEl = document.getElementById('menuMobile');
    if (offcanvasEl) {
        var linkMovil = offcanvasEl.querySelector('a[href="cuenta.html"]');
        if (linkMovil) {
            linkMovil.href      = destino;
            linkMovil.innerHTML = '<i class="bi bi-person-fill icono-menu"></i> ' + nombre;
        }
    }
}

function _rutaEmpleado(cargo) {
    var rutas = { Gerente: 'inicio.html', Administrador: 'inicio.html', Cajero: 'pos.html', Repartidor: 'repartidor.html', Cocinero: 'cocina.html' };
    return _prefijoNegocio() + (rutas[cargo] || 'inicio.html');
}

// Cierra sesión del empleado con confirmación (usable desde cualquier panel)
window.cerrarSesionEmpleado = async function () {
    if (!confirm('¿Cerrar sesión?')) return;
    await _marcarNoDisponible();
    localStorage.removeItem('empleadoHawaiiana');
    window.location.href = _prefijoNegocio() + 'empleado.html';
};

// Cierra sesión del cliente con confirmación
window.cerrarSesionCliente = function () {
    if (!confirm('¿Cerrar sesión?')) return;
    localStorage.removeItem('clienteHawaiiana');
    window.location.href = _prefijoCliente() + 'cuenta.html';
};

function actualizarBadgesGlobal() {
    try {
        var carrito = JSON.parse(localStorage.getItem('carritoHawaiiana') || '[]');
        var total   = carrito.reduce(function (acc, i) { return acc + i.cantidad; }, 0);
        document.querySelectorAll('.badge-carrito').forEach(function (b) {
            b.textContent   = total;
            b.style.display = total > 0 ? 'inline-flex' : 'none';
        });
    } catch (e) { /* sin acción */ }
}

window.formatearDinero  = function (n) { return '$' + parseFloat(n).toFixed(2); };
window.validarTelefono  = function (t) { return String(t).replace(/\D/g, '').length === 10; };

window.mostrarNotificacion = function (msg, tipo, ms) {
    tipo = tipo || 'info'; ms = ms || 4000;
    var cls = { success: 'bg-success', error: 'bg-danger', warning: 'bg-warning text-dark', info: 'bg-info text-dark' };
    var d = document.createElement('div');
    d.className = 'alert ' + (cls[tipo] || cls.info) + ' alert-dismissible fade show position-fixed shadow';
    d.style.cssText = 'top:20px;right:20px;z-index:9999;min-width:280px;max-width:340px;';
    d.innerHTML = '<button type="button" class="btn-close" data-bs-dismiss="alert"></button>' + msg;
    document.body.appendChild(d);
    setTimeout(function () { if (d.parentNode) d.remove(); }, ms);
};

// Muestra una pantalla de error de acceso restringido con botón de regreso.
window.mostrarErrorAcceso = function (mensaje, urlRegreso) {
    document.body.style.overflow = 'hidden';
    var overlay       = document.createElement('div');
    overlay.id        = 'overlay-error-acceso';
    overlay.style.cssText = 'position:fixed;inset:0;z-index:9999;display:flex;align-items:center;justify-content:center;padding:20px;background:var(--bg-body,#f8f9fa);';
    overlay.innerHTML =
        '<div class="tarjeta-tema p-5 text-center shadow rounded" style="max-width:460px;width:100%;">' +
        '<i class="bi bi-shield-lock-fill" style="font-size:3rem;color:#dc3545;"></i>' +
        '<h4 class="texto-principal mt-3 mb-2">Acceso Restringido</h4>' +
        '<p class="texto-secundario mb-4">' +
            (mensaje || 'No tienes permiso para acceder a esta sección.') +
        '</p>' +
        '<a href="' + (urlRegreso || '../cliente/index.html') + '" class="btn btn-rojo w-100">' +
        '<i class="bi bi-arrow-left-circle"></i> Regresar</a>' +
        '</div>';
    document.body.appendChild(overlay);
};

window.verDatos = function () {
    return {
        carrito:  JSON.parse(localStorage.getItem('carritoHawaiiana')  || '[]'),
        pedidos:  JSON.parse(localStorage.getItem('pedidosHawaiiana')   || '[]'),
        cliente:  JSON.parse(localStorage.getItem('clienteHawaiiana')   || 'null'),
        empleado: JSON.parse(localStorage.getItem('empleadoHawaiiana')  || 'null'),
        tema:     localStorage.getItem('temaPizzeria') || 'claro'
    };
};

window.limpiarDatos = function () {
    if (!confirm('Eliminar carrito, pedidos e historial. ¿Continuar?')) return;
    ['carritoHawaiiana', 'pedidosHawaiiana', 'ventasPOS', 'pedidosRepartidor'].forEach(function (k) {
        localStorage.removeItem(k);
    });
    location.reload();
};

// Timeout de sesión para empleados: cierra sesión tras 30 minutos sin actividad
(function () {
    var empleado = JSON.parse(localStorage.getItem('empleadoHawaiiana') || 'null');
    if (!empleado) return;

    var TIMEOUT_MS = 30 * 60 * 1000;
    var timer;

    function resetTimer() {
        clearTimeout(timer);
        timer = setTimeout(async function () {
            await _marcarNoDisponible();
            localStorage.removeItem('empleadoHawaiiana');
            alert('Tu sesión expiró por inactividad. Ingresa de nuevo.');
            window.location.href = _prefijoNegocio() + 'empleado.html';
        }, TIMEOUT_MS);
    }

    ['mousemove', 'keydown', 'click', 'touchstart', 'scroll'].forEach(function (ev) {
        document.addEventListener(ev, resetTimer, { passive: true });
    });

    resetTimer();
})();
