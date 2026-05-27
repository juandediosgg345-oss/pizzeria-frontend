// repartidor.js — Panel del Repartidor conectado al API
var API_BASE = '/api';
var _empleado         = null;
var _repartidorId     = null;
var pedidos           = [];
var pedidoActual      = null;
var filtroActual      = 'todos';
var _historialCargado = false;
var _historialCache   = [];  // Todos los entregados (para paginación)
var _pagHistorial     = { pagina: 1, porPagina: 6 };

document.addEventListener('DOMContentLoaded', function () {
    var cliente  = JSON.parse(localStorage.getItem('clienteHawaiiana') || 'null');
    _empleado    = JSON.parse(localStorage.getItem('empleadoHawaiiana') || 'null');

    if (!_empleado) {
        if (cliente) {
            mostrarErrorAcceso('Esta área es exclusiva para el personal de reparto.', '../cliente/index.html');
        } else {
            window.location.href = 'empleado.html';
        }
        return;
    }

    var nombreEl = document.getElementById('nombre-repartidor');
    if (nombreEl) nombreEl.textContent = _empleado.nombre + ' ' + (_empleado.apPaterno || '');

    var esAdmin = (_empleado.cargo === 'Gerente' || _empleado.cargo === 'Administrador');
    _repartidorId = _empleado.idRepartidor || null;

    if (esAdmin) {
        _inyectarBotonModulos();
        if (!_repartidorId) _repartidorId = 'ADMIN';
    }

    if (!_repartidorId && !esAdmin) {
        var cont = document.getElementById('lista-pedidos');
        if (cont) cont.innerHTML =
            '<div class="col-12"><div class="alert alert-warning">' +
            '<i class="bi bi-exclamation-triangle-fill"></i> ' +
            'No tienes un perfil de repartidor asignado. Contacta al administrador.' +
            '</div></div>';
        return;
    }

    // Al entrar al panel marcar como Disponible automáticamente
    if (_repartidorId && _repartidorId !== 'ADMIN') {
        fetch(API_BASE + '/repartidores/' + _repartidorId + '/disponibilidad', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ estado: 'Disponible' })
        }).then(function () {
            var badge = document.getElementById('badge-disponibilidad');
            if (badge) { badge.textContent = 'Disponible'; badge.className = 'badge bg-success'; }
        }).catch(function () {});
    }

    cargarPedidos();


    // Sobreescribir botones de logout para marcar No disponible ANTES de salir
    setTimeout(function () {
        var btnNav = document.getElementById('btn-cerrar-sesion-nav');
        if (btnNav) {
            var clon = btnNav.cloneNode(true);
            btnNav.parentNode.replaceChild(clon, btnNav);
            clon.addEventListener('click', cerrarSesionRepartidor);
        }
        var offMov = document.getElementById('menuMobile');
        if (offMov) {
            offMov.querySelectorAll('a.menu-item-peligro').forEach(function (link) {
                link.addEventListener('click', function (e) {
                    e.preventDefault(); e.stopImmediatePropagation();
                    cerrarSesionRepartidor();
                });
            });
        }
    }, 600);
});

// Marca No disponible en BD y luego cierra sesión
async function cerrarSesionRepartidor() {
    if (!confirm('¿Cerrar sesión?')) return;
    if (_repartidorId && _repartidorId !== 'ADMIN') {
        try {
            await fetch(API_BASE + '/repartidores/' + _repartidorId + '/disponibilidad', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ estado: 'No disponible' })
            });
        } catch (e) {}
    }
    localStorage.removeItem('empleadoHawaiiana');
    window.location.href = 'empleado.html';
}



function _inyectarBotonModulos() {
    var navDesktop = document.querySelector('.d-none.d-lg-flex');
    if (navDesktop && !document.getElementById('btn-volver-modulos')) {
        var btn = document.createElement('a');
        btn.id = 'btn-volver-modulos'; btn.href = 'inicio.html';
        btn.className = 'btn btn-sm btn-outline-warning';
        btn.innerHTML = '<i class="bi bi-grid-3x3-gap-fill"></i> Módulos';
        var btnTema = navDesktop.querySelector('#btn-tema');
        if (btnTema) navDesktop.insertBefore(btn, btnTema);
        else         navDesktop.insertBefore(btn, navDesktop.firstChild);
    }
    var offcanvasBody = document.querySelector('.offcanvas-body');
    if (offcanvasBody && !document.getElementById('link-modulos-movil')) {
        var link = document.createElement('a');
        link.id = 'link-modulos-movil'; link.href = 'inicio.html';
        link.className = 'menu-item-movil';
        link.innerHTML = '<i class="bi bi-grid-3x3-gap-fill icono-menu"></i> Volver a Módulos';
        offcanvasBody.insertBefore(link, offcanvasBody.firstChild);
    }
}

// ── Paginación del historial ──────────────────────────────────────────────────
function _renderNavHistorial() {
    var cont = document.getElementById('paginacion-historial');
    if (!cont) return;
    var total     = _historialCache.length;
    var totalPags = Math.ceil(total / _pagHistorial.porPagina);
    if (totalPags <= 1) { cont.innerHTML = ''; return; }

    var desde = (_pagHistorial.pagina - 1) * _pagHistorial.porPagina + 1;
    var hasta  = Math.min(_pagHistorial.pagina * _pagHistorial.porPagina, total);

    cont.innerHTML =
        '<nav class="d-flex align-items-center justify-content-between mt-3 flex-wrap gap-2">' +
        '<small class="texto-secundario">' + desde + '–' + hasta + ' de ' + total + '</small>' +
        '<ul class="pagination pagination-sm mb-0">' +
        '<li class="page-item ' + (_pagHistorial.pagina === 1 ? 'disabled' : '') + '">' +
        '<button class="page-link" onclick="irPaginaHistorial(' + (_pagHistorial.pagina - 1) + ')">‹ Anterior</button></li>' +
        '<li class="page-item disabled"><span class="page-link">' + _pagHistorial.pagina + ' / ' + totalPags + '</span></li>' +
        '<li class="page-item ' + (_pagHistorial.pagina === totalPags ? 'disabled' : '') + '">' +
        '<button class="page-link" onclick="irPaginaHistorial(' + (_pagHistorial.pagina + 1) + ')">Siguiente ›</button></li>' +
        '</ul></nav>';
}

function irPaginaHistorial(n) {
    var totalPags = Math.ceil(_historialCache.length / _pagHistorial.porPagina);
    if (n < 1 || n > totalPags) return;
    _pagHistorial.pagina = n;
    renderHistorial(_historialCache);
}

function renderHistorial(lista) {
    var cont = document.getElementById('lista-historial');
    if (!cont) return;
    cont.innerHTML = '';

    if (!lista.length) {
        cont.innerHTML = '<div class="col-12"><p class="texto-secundario">No tienes entregas registradas aún.</p></div>';
        _renderNavHistorial();
        return;
    }

    var desde   = (_pagHistorial.pagina - 1) * _pagHistorial.porPagina;
    var pagina  = lista.slice(desde, desde + _pagHistorial.porPagina);

    pagina.forEach(function (p) {
        var col = document.createElement('div');
        col.className = 'col-md-6 col-lg-4 mb-3';
        col.innerHTML =
            '<div class="tarjeta-tema p-3" style="border-left:4px solid #198754;opacity:.85;">' +
            '<div class="d-flex justify-content-between align-items-start mb-1">' +
            '<h6 class="texto-principal mb-0"><strong>' + p.idPedido + '</strong></h6>' +
            '<span class="badge bg-success">Entregado</span>' +
            '</div>' +
            '<p class="texto-principal mb-0 small">' + (p.nombreCliente || '—') + '</p>' +
            '<p class="texto-secundario mb-0" style="font-size:.82em;">' + p.fecha + ' · ' + p.horaPedido + '</p>' +
            '<p class="texto-secundario mb-0" style="font-size:.82em;">' +
            'Pago: ' + (p.metodoPago || '—') + ' · <span class="precio-destacado">$' + (p.total || 0).toFixed(2) + '</span>' +
            '</p></div>';
        cont.appendChild(col);
    });

    _renderNavHistorial();
}

// ── Carga de pedidos activos ──────────────────────────────────────────────────
async function cargarPedidos() {
    try {
        const resListos  = await fetch(`${API_BASE}/pedidos?tipoEntrega=Domicilio&estado=Listo`);
        const dataListos = await resListos.json();

        const resMios    = await fetch(`${API_BASE}/pedidos?idRepartidor=${_repartidorId}`);
        const dataMios   = await resMios.json();

        var todosPedidos = [...dataListos, ...dataMios].filter(function (v, i, a) {
            return a.findIndex(function (t) { return t.idPedido === v.idPedido; }) === i;
        });

        // Solo activos en la lista principal
        pedidos = todosPedidos
            .filter(function (p) { return p.estado !== 'Entregado' && p.estado !== 'Cancelado'; })
            .map(function (p) {
                return {
                    idPedido: p.idPedido, fecha: p.fecha, horaPedido: p.horaPedido,
                    estado: _estadoInterno(p.estado), estadoAPI: p.estado,
                    metodoPago: p.metodoPago, total: p.total,
                    nombreCliente: p.nombreCliente, totalItems: p.totalItems,
                    telefono: null, direccion: null, detalles: null
                };
            });

        actualizarDisponibilidad();
        renderPedidos(filtroActual);
    } catch (err) {
        console.error(err);
        mostrarNotificacion('Error al cargar pedidos.', 'error');
    }
}

function _estadoInterno(e) {
    return { 'Listo': 'listo', 'En camino': 'camino', 'Entregado': 'entregado', 'Cancelado': 'cancelado' }[e] || 'otro';
}
function _estadoAPI(e) {
    return { 'listo': 'Listo', 'camino': 'En camino', 'entregado': 'Entregado' }[e] || e;
}

function renderPedidos(filtro) {
    filtroActual = filtro;
    document.querySelectorAll('.btn-filtro').forEach(function (b) {
        b.classList.remove('btn-rojo'); b.classList.add('btn-secondary');
    });
    var botones = document.querySelectorAll('.btn-filtro');
    if (botones.length >= 3) {
        if (filtro === 'todos')  botones[0].classList.replace('btn-secondary', 'btn-rojo');
        if (filtro === 'listo')  botones[1].classList.replace('btn-secondary', 'btn-rojo');
        if (filtro === 'camino') botones[2].classList.replace('btn-secondary', 'btn-rojo');
    }

    var lista      = filtro === 'todos' ? pedidos : pedidos.filter(function (p) { return p.estado === filtro; });
    var contenedor = document.getElementById('lista-pedidos');
    var sinPed     = document.getElementById('sin-pedidos');
    if (!contenedor) return;

    if (!lista.length) {
        contenedor.innerHTML = '';
        if (sinPed) sinPed.style.display = 'block';
        return;
    }
    if (sinPed) sinPed.style.display = 'none';
    contenedor.innerHTML = '';

    lista.forEach(function (p) {
        var info = badgeInfo(p.estado);
        var col  = document.createElement('div');
        col.className = 'col-md-6 col-lg-4 mb-4';
        col.innerHTML =
            '<div class="tarjeta-tema p-3 h-100" style="border-left:4px solid ' + info.color + ';">' +
            '<div class="d-flex justify-content-between align-items-start mb-2">' +
            '<h6 class="texto-principal mb-0"><strong>' + p.idPedido + '</strong></h6>' +
            '<span class="badge" style="background:' + info.color + ';">' + info.texto + '</span>' +
            '</div>' +
            '<p class="texto-principal mb-1"><strong>Cliente:</strong> ' + (p.nombreCliente || '—') + '</p>' +
            '<p class="texto-secundario mb-1" style="font-size:.86em;">' + (p.totalItems || 0) + ' prod. · ' + (p.horaPedido || '') + '</p>' +
            '<p class="texto-secundario mb-2" style="font-size:.86em;">Pago: ' + (p.metodoPago || '—') + '</p>' +
            '<div class="d-flex justify-content-between align-items-center">' +
            '<span class="precio-destacado" style="font-size:1.1em;">$' + (p.total || 0).toFixed(2) + '</span>' +
            '<button class="btn btn-rojo btn-sm" onclick="abrirDetalle(\'' + p.idPedido + '\')">Ver Detalle</button>' +
            '</div></div>';
        contenedor.appendChild(col);
    });
}

function filtrarPedidos(estado) { renderPedidos(estado); }

function badgeInfo(estado) {
    var m = {
        listo:     { color: '#fd7e14', texto: 'Listo (En Cocina)' },
        camino:    { color: '#0dcaf0', texto: 'En Camino'         },
        entregado: { color: '#198754', texto: 'Entregado'         },
        cancelado: { color: '#dc3545', texto: 'Cancelado'         }
    };
    return m[estado] || { color: '#6c757d', texto: estado };
}

// ── Historial con paginación ──────────────────────────────────────────────────
function toggleHistorial() {
    var sec  = document.getElementById('seccion-historial');
    var btn  = document.getElementById('btn-toggle-historial');
    if (!sec || !btn) return;
    var abierto = sec.style.display !== 'none';
    if (abierto) {
        sec.style.display = 'none';
        btn.innerHTML = '<i class="bi bi-chevron-down"></i> Mostrar historial';
    } else {
        sec.style.display = 'block';
        btn.innerHTML = '<i class="bi bi-chevron-up"></i> Ocultar historial';
        if (!_historialCargado) cargarHistorialEntregados();
    }
}

async function cargarHistorialEntregados() {
    var loading = document.getElementById('cargando-historial');
    if (loading) loading.style.display = 'flex';
    try {
        const res  = await fetch(`${API_BASE}/pedidos?idRepartidor=${_repartidorId}&estado=Entregado`);
        const data = await res.json();
        _historialCache   = data;
        _historialCargado = true;
        _pagHistorial.pagina = 1;
        if (loading) loading.style.display = 'none';
        renderHistorial(data);
    } catch (err) {
        if (loading) loading.style.display = 'none';
        var cont = document.getElementById('lista-historial');
        if (cont) cont.innerHTML = '<div class="col-12"><p class="texto-secundario text-danger">Error al cargar el historial.</p></div>';
    }
}

// ── Modal de detalle ──────────────────────────────────────────────────────────
async function abrirDetalle(idPedido) {
    pedidoActual = pedidos.find(function (p) { return p.idPedido === idPedido; });
    if (!pedidoActual) return;
    var set = function (id, v) { var el = document.getElementById(id); if (el) el.textContent = v; };

    if (!pedidoActual.detalles) {
        try {
            const res  = await fetch(`${API_BASE}/pedidos/${idPedido}`);
            const data = await res.json();
            pedidoActual.telefono   = data.telefonoCliente || '—';
            pedidoActual.direccion  = data.direccion || null;
            pedidoActual.detalles   = data.detalles  || [];
            pedidoActual.idEmpleado = data.idEmpleado || null;
        } catch (err) { mostrarNotificacion('Error al cargar detalles.', 'error'); return; }
    }

    var dir = pedidoActual.direccion;
    set('detalle-direccion', dir
        ? dir.calle + ' #' + dir.numExterior + ', Col. ' + dir.colonia + (dir.referencia ? ' · ' + dir.referencia : '')
        : '—');
    set('detalle-cliente',  pedidoActual.nombreCliente || '—');
    set('detalle-telefono', pedidoActual.telefono || '—');
    var metodos = { efectivo: 'Efectivo', tarjeta: 'Tarjeta', transferencia: 'Transferencia' };
    set('detalle-pago',    metodos[pedidoActual.metodoPago] || pedidoActual.metodoPago || '—');
    set('detalle-total',   '$' + (pedidoActual.total || 0).toFixed(2));
    set('detalle-atendio', pedidoActual.idEmpleado || '—');

    var tbody = document.getElementById('detalle-productos');
    if (tbody) {
        tbody.innerHTML = '';
        (pedidoActual.detalles || []).forEach(function (det) {
            var tr = document.createElement('tr');
            var tam = det.tamanio && det.tamanio !== 'Único' ? det.tamanio : '';
            var obs = det.observaciones ? det.observaciones : '—';
            tr.innerHTML = '<td class="texto-principal">' + (det.nombreProducto || '—') +
                           (tam ? '<br><small class="texto-secundario">' + tam + '</small>' : '') + '</td>' +
                           '<td class="texto-principal">' + det.cantidad + '</td>' +
                           '<td class="texto-secundario">' + obs + '</td>';
            tbody.appendChild(tr);
        });
    }

    var btnSalir    = document.getElementById('btn-salir-reparto');
    var btnEntregar = document.getElementById('btn-entregar');
    var avisoPaso   = document.getElementById('aviso-paso');
    if (btnSalir && btnEntregar) {
        btnSalir.style.display    = pedidoActual.estado === 'listo'  ? 'block' : 'none';
        btnEntregar.style.display = pedidoActual.estado === 'camino' ? 'block' : 'none';
        if (avisoPaso) avisoPaso.style.display = 'none';
    }
    new bootstrap.Modal(document.getElementById('modalPedido')).show();
}

// ── Cambios de estado ─────────────────────────────────────────────────────────
async function marcarEnCamino() {
    if (!pedidoActual || pedidoActual.estado !== 'listo') return;
    try {
        const resAsignar = await fetch(`${API_BASE}/pedidos/${pedidoActual.idPedido}/asignar-repartidor`, {
            method: 'PATCH', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ idRepartidor: _repartidorId })
        });
        if (!resAsignar.ok) throw new Error('Error al asignar');
        await _actualizarEstado('camino');
    } catch (err) { mostrarNotificacion('No se pudo tomar el pedido.', 'error'); }
}

async function marcarEntregado() {
    if (!pedidoActual) return;
    if (pedidoActual.estado !== 'camino') {
        var av = document.getElementById('aviso-paso');
        if (av) av.style.display = 'block';
        return;
    }
    await _actualizarEstado('entregado');
}

async function _actualizarEstado(nuevoEstado) {
    try {
        const res = await fetch(`${API_BASE}/pedidos/${pedidoActual.idPedido}/estado`, {
            method: 'PATCH', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ estado: _estadoAPI(nuevoEstado) })
        });
        if (!res.ok) throw new Error('HTTP ' + res.status);
        pedidoActual.estado    = nuevoEstado;
        pedidoActual.estadoAPI = _estadoAPI(nuevoEstado);
        actualizarDisponibilidad();
        renderPedidos(filtroActual);

        if (nuevoEstado === 'camino') {
            var btnSalir    = document.getElementById('btn-salir-reparto');
            var btnEntregar = document.getElementById('btn-entregar');
            if (btnSalir)    btnSalir.style.display    = 'none';
            if (btnEntregar) btnEntregar.style.display = 'block';
            mostrarNotificacion('Pedido tomado — en camino 🚚', 'success');
        } else if (nuevoEstado === 'entregado') {
            pedidos = pedidos.filter(function (p) { return p.idPedido !== pedidoActual.idPedido; });
            bootstrap.Modal.getInstance(document.getElementById('modalPedido')).hide();
            mostrarNotificacion('Pedido <strong>' + pedidoActual.idPedido + '</strong> entregado ✅', 'success');
            renderPedidos(filtroActual);
            // Forzar recarga del historial si está abierto
            _historialCargado = false;
            var secHist = document.getElementById('seccion-historial');
            if (secHist && secHist.style.display !== 'none') cargarHistorialEntregados();
        }
    } catch (err) { mostrarNotificacion('No se pudo actualizar el estado.', 'error'); }
}

function actualizarDisponibilidad() {
    var el = document.getElementById('estado-disponibilidad');
    if (!el) return;
    var enCamino = pedidos.some(function (p) { return p.estado === 'camino'; });
    el.textContent = enCamino ? 'En Reparto' : 'Disponible';
    el.className   = 'badge ' + (enCamino ? 'bg-warning text-dark' : 'bg-success') + ' ms-1';
}
