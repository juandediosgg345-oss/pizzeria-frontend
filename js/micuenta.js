// micuenta.js — Panel del cliente conectado al API
var API_BASE = 'http://pizzhawaiiana-001-site1.qtempurl.com/api';
var _cacheDetalles = {};

document.addEventListener('DOMContentLoaded', function () {
    var cliente = JSON.parse(localStorage.getItem('clienteHawaiiana') || 'null');
    if (!cliente) { window.location.href = 'cuenta.html'; return; }

    cargarPerfil(cliente);
    cargarDirecciones(cliente.idCliente);
    cargarHistorial(cliente.idCliente);

    var btnAgrDir  = document.getElementById('btn-agregar-dir');
    var formDirSec = document.getElementById('form-dir-sec');
    if (btnAgrDir && formDirSec) {
        btnAgrDir.addEventListener('click', function () {
            formDirSec.style.display = formDirSec.style.display === 'none' ? 'block' : 'none';
        });
    }
    var formDir = document.getElementById('form-direccion');
    if (formDir) formDir.addEventListener('submit', function (e) { guardarDireccion(e, cliente.idCliente); });
});

// --- PERFIL ---
function cargarPerfil(cliente) {
    var cont = document.getElementById('datos-usuario');
    if (!cont) return;
    cont.innerHTML =
        '<div class="row g-3 mb-3">' +
        '<div class="col-sm-4"><p class="texto-secundario small mb-1">Nombre</p><p class="texto-principal fw-bold mb-0">' + (cliente.nombre || '—') + '</p></div>' +
        '<div class="col-sm-4"><p class="texto-secundario small mb-1">Apellido Paterno</p><p class="texto-principal fw-bold mb-0">' + (cliente.apPaterno || '—') + '</p></div>' +
        '<div class="col-sm-4"><p class="texto-secundario small mb-1">Apellido Materno</p><p class="texto-principal fw-bold mb-0">' + (cliente.apMaterno || '—') + '</p></div>' +
        '</div><div class="mb-4"><p class="texto-secundario small mb-1">Teléfono</p><p class="texto-principal fw-bold mb-0">' + (cliente.telefono || '—') + '</p></div>' +
        '<button class="btn btn-sm btn-outline-danger" onclick="cerrarSesionMC()"><i class="bi bi-box-arrow-right"></i> Cerrar sesión</button>';
}

function cerrarSesionMC() {
    if (!confirm('¿Cerrar sesión?')) return;
    localStorage.removeItem('clienteHawaiiana');
    window.location.href = 'cuenta.html';
}

// --- DIRECCIONES ---
async function cargarDirecciones(idCliente) {
    var cont = document.getElementById('lista-direcciones');
    if (!cont) return;
    cont.innerHTML = '<p class="texto-secundario">Cargando...</p>';
    try {
        const res  = await fetch(`${API_BASE}/clientes/${idCliente}/direcciones`);
        const dirs = await res.json();
        if (!dirs.length) { cont.innerHTML = '<p class="texto-secundario">No tienes direcciones guardadas.</p>'; return; }
        cont.innerHTML = '';
        dirs.forEach(function (dir) {
            var item = document.createElement('div');
            item.className = 'tarjeta-tema p-3 mb-2 d-flex justify-content-between align-items-start';
            item.innerHTML =
                '<div><p class="texto-principal fw-bold mb-0">' + (dir.alias || 'Dirección guardada') + '</p>' +
                '<p class="texto-secundario mb-0" style="font-size:.88em;">' + dir.calle + ' #' + dir.numExterior + '</p>' +
                '<p class="texto-secundario mb-0" style="font-size:.82em;">Col. ' + dir.colonia + (dir.referencia ? ' · ' + dir.referencia : '') + '</p></div>' +
                '<div class="d-flex gap-1">' +
                '<button class="btn btn-sm btn-outline-warning flex-shrink-0" onclick="editarDireccion(\'' + idCliente + '\',\'' + dir.idDireccion + '\',\'' + (dir.alias || '') + '\',\'' + dir.calle + '\',\'' + dir.numExterior + '\',\'' + dir.colonia + '\',\'' + (dir.referencia || '') + '\')"><i class="bi bi-pencil"></i></button>' +
                '<button class="btn btn-sm btn-outline-danger flex-shrink-0" onclick="eliminarDireccion(\'' + idCliente + '\',\'' + dir.idDireccion + '\')"><i class="bi bi-trash"></i></button></div>';
            cont.appendChild(item);
        });
    } catch (err) { cont.innerHTML = '<p class="texto-secundario text-danger">Error al cargar direcciones.</p>'; }
}

async function guardarDireccion(e, idCliente) {
    e.preventDefault();
    var form = e.target;
    var editandoId      = form.dataset.editandoId;
    var editandoCliente = form.dataset.editandoCliente || idCliente;
    var calle   = (document.getElementById('dir-calle')       || {value:''}).value.trim();
    var numExt  = (document.getElementById('dir-numExterior') || {value:''}).value.trim();
    var colonia = (document.getElementById('dir-colonia')     || {value:''}).value.trim();
    var ref     = (document.getElementById('dir-referencia')  || {value:''}).value.trim();
    var alias   = (document.getElementById('dir-alias')       || {value:''}).value.trim() || 'Mi casa';
    if (!calle || !numExt || !colonia) { mostrarNotificacion('Calle, número y colonia son obligatorios.', 'warning'); return; }
    var btn = e.target.querySelector('button[type="submit"]');
    var textoOrig = btn ? btn.innerHTML : 'Guardar';
    if (btn) { btn.innerHTML = '<span class="spinner-border spinner-border-sm"></span>'; btn.disabled = true; }
    try {
        var clienteDestino = editandoId ? editandoCliente : idCliente;
        if (editandoId) await fetch(`${API_BASE}/clientes/${clienteDestino}/direcciones/${editandoId}`, { method: 'DELETE' });
        const res = await fetch(`${API_BASE}/clientes/${clienteDestino}/direcciones`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ calle, numExterior: numExt, colonia, referencia: ref, alias })
        });
        if (res.ok) {
            mostrarNotificacion(editandoId ? 'Dirección actualizada.' : 'Dirección guardada.', 'success');
            e.target.reset();
            delete form.dataset.editandoId; delete form.dataset.editandoCliente;
            var btnForm = form.querySelector('button[type="submit"]');
            if (btnForm) btnForm.innerHTML = '<i class="bi bi-check-lg"></i> Guardar';
            document.getElementById('form-dir-sec').style.display = 'none';
            cargarDirecciones(clienteDestino);
        } else { const data = await res.json(); mostrarNotificacion(data.mensaje || 'Error al guardar.', 'error'); }
    } catch (err) { mostrarNotificacion('Error de conexión.', 'error'); }
    finally { if (btn) { btn.innerHTML = textoOrig; btn.disabled = false; } }
}

async function eliminarDireccion(idCliente, idDir) {
    if (!confirm('¿Eliminar esta dirección?')) return;
    try {
        const res = await fetch(`${API_BASE}/clientes/${idCliente}/direcciones/${idDir}`, { method: 'DELETE' });
        if (res.ok || res.status === 204) { mostrarNotificacion('Dirección eliminada.', 'success'); cargarDirecciones(idCliente); }
        else mostrarNotificacion('No se pudo eliminar.', 'error');
    } catch (err) { mostrarNotificacion('Error de conexión.', 'error'); }
}

function editarDireccion(idCliente, idDir, alias, calle, numExt, colonia, referencia) {
    var setVal = function(id, v) { var el = document.getElementById(id); if (el) el.value = v; };
    setVal('dir-alias', alias); setVal('dir-calle', calle); setVal('dir-numExterior', numExt);
    setVal('dir-colonia', colonia); setVal('dir-referencia', referencia);
    var sec = document.getElementById('form-dir-sec');
    if (sec) sec.style.display = 'block';
    var form = document.getElementById('form-direccion');
    if (form) {
        form.dataset.editandoId = idDir; form.dataset.editandoCliente = idCliente;
        var btn = form.querySelector('button[type="submit"]');
        if (btn) btn.innerHTML = '<i class="bi bi-check-lg"></i> Guardar cambios';
    }
    if (sec) sec.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// --- HISTORIAL ---
async function cargarHistorial(idCliente) {
    var cont = document.getElementById('historial-pedidos');
    if (!cont) return;
    cont.innerHTML = '<p class="texto-secundario">Cargando...</p>';
    try {
        const res     = await fetch(`${API_BASE}/pedidos?idCliente=${idCliente}`);
        const pedidos = await res.json();
        if (!pedidos.length) {
            cont.innerHTML = '<p class="texto-secundario mb-3">No tienes pedidos registrados.</p>' +
                '<a href="menu.html" class="btn btn-rojo btn-sm"><i class="bi bi-grid-fill"></i> Ver Menú</a>';
            return;
        }
        var colores = { Preparando:'#fd7e14', 'En camino':'#0dcaf0', Entregado:'#198754', Cancelado:'#dc3545' };
        var metodos = { efectivo:'Efectivo', tarjeta:'Tarjeta', transferencia:'Transferencia' };
        cont.innerHTML = '';
        pedidos.forEach(function (p) {
            var color = colores[p.estado] || '#6c757d';
            var uid   = 'det-' + p.idPedido.replace(/\W/g, '');

            // Mostrar quién está llevando el pedido si está en camino
            var repartidorBadge = '';
            if (p.idRepartidor && (p.estado === 'En camino' || p.estado === 'Entregado')) {
                var iconoRep = p.estado === 'En camino' ? 'bi-truck' : 'bi-check-circle';
                var textoRep = p.estado === 'En camino' ? 'En camino · Repartidor: ' + p.idRepartidor : 'Entregado por: ' + p.idRepartidor;
                repartidorBadge = '<p class="texto-secundario mb-0" style="font-size:.82em;"><i class="bi ' + iconoRep + '"></i> ' + textoRep + '</p>';
            }

            var card = document.createElement('div');
            card.className = 'tarjeta-tema p-3 mb-3';
            card.style.borderLeft = '4px solid ' + color;
            card.innerHTML =
                '<div class="d-flex justify-content-between align-items-start flex-wrap gap-2">' +
                '<div><p class="texto-principal mb-0 fw-bold">' + p.idPedido + '</p>' +
                '<p class="texto-secundario mb-0" style="font-size:.82em;">' + p.fecha + ' · ' + p.horaPedido + '</p>' +
                '<p class="texto-secundario mb-0" style="font-size:.84em;">' + p.totalItems + ' prod. · ' + p.tipoEntrega + ' · ' + (metodos[p.metodoPago] || p.metodoPago) + '</p>' +
                repartidorBadge + '</div>' +
                '<div class="text-end"><span class="badge mb-1" style="background-color:' + color + ';">' + p.estado + '</span><br>' +
                '<span class="precio-destacado" style="font-size:1.05em;">$' + (p.total || 0).toFixed(2) + '</span></div></div>' +
                '<button class="btn btn-link texto-secundario p-0 mt-1" style="font-size:.82em;" ' +
                'onclick="toggleDetalle(\'' + p.idPedido + '\', \'' + uid + '\', this)">Ver detalle ▾</button>' +
                '<div id="' + uid + '" style="display:none;"><div class="mt-2 ps-1" id="items-' + uid + '">' +
                '<p class="texto-secundario" style="font-size:.84em;">Cargando...</p></div></div>';
            cont.appendChild(card);
        });
    } catch (err) { cont.innerHTML = '<p class="texto-secundario text-danger">Error al cargar historial.</p>'; }
}

async function toggleDetalle(idPedido, uid, btnEl) {
    var seccion   = document.getElementById(uid);
    var itemsCont = document.getElementById('items-' + uid);
    if (!seccion || !itemsCont) return;
    if (seccion.style.display !== 'none') {
        seccion.style.display = 'none'; btnEl.textContent = 'Ver detalle ▾'; return;
    }
    seccion.style.display = 'block'; btnEl.textContent = 'Ocultar ▴';
    if (_cacheDetalles[idPedido]) { renderDetalles(itemsCont, _cacheDetalles[idPedido]); return; }
    itemsCont.innerHTML = '<p class="texto-secundario" style="font-size:.84em;">Cargando...</p>';
    try {
        const res  = await fetch(`${API_BASE}/pedidos/${idPedido}`);
        const data = await res.json();
        _cacheDetalles[idPedido] = data;
        renderDetalles(itemsCont, data);
    } catch (err) {
        itemsCont.innerHTML = '<p class="texto-secundario text-danger" style="font-size:.84em;">Error al cargar detalles.</p>';
    }
}

function renderDetalles(cont, data) {
    var detalles = data.detalles || data || [];
    var extra = '';
    // Mostrar quién atendió y quién lo llevó si están disponibles
    if (data.idEmpleado) extra += '<p class="texto-secundario mb-1" style="font-size:.82em;"><i class="bi bi-person-badge-fill"></i> Atendido por: <strong>' + data.idEmpleado + '</strong></p>';
    if (data.idRepartidor) extra += '<p class="texto-secundario mb-1" style="font-size:.82em;"><i class="bi bi-truck"></i> Repartidor: <strong>' + data.idRepartidor + '</strong></p>';
    var lista = '';
    if (detalles.length) {
        lista = '<ul class="mb-0 ps-3">' +
            detalles.map(function (d) {
                return '<li style="font-size:.84em;" class="texto-secundario">' +
                    d.cantidad + 'x ' + d.nombreProducto +
                    (d.tamanio ? ' (' + d.tamanio + ')' : '') +
                    ' — $' + (d.subtotal || 0).toFixed(2) +
                    (d.observaciones ? '<br><small style="font-size:.85em;">' + d.observaciones + '</small>' : '') + '</li>';
            }).join('') + '</ul>';
    } else {
        lista = '<p class="texto-secundario" style="font-size:.84em;">Sin productos registrados.</p>';
    }
    cont.innerHTML = extra + lista;
}
