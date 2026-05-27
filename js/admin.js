// admin.js — Panel de administrador
var API_BASE = 'http://pizzhawaiiana-001-site1.qtempurl.com/api';

let datosProductosCache  = [];
let gruposProductos      = {};
let _pedidosCache        = [];
let _pedidosActivos      = [];
let _empleadosActivos    = [];
let _empleadosMap        = {};  // id → empleado (para lookups rápidos)
let _productosPromo      = [];  // productos seleccionados para la promoción actual
let _editandoPromoIds   = [];  // IDs a eliminar cuando se edita/reactiva una promo

let _pag = {
    pedidos:   { pagina: 1, porPagina: 10 },
    empleados: { pagina: 1, porPagina: 10 },
    productos: { pagina: 1, porPagina: 12 }
};

const ICONOS_ADMIN = {
    pizza:'bi-circle-fill', preferida:'bi-heart-fill', deluxe:'bi-gem',
    bebida:'bi-cup-straw', entrada:'bi-egg-fried', snack:'bi-bag-fill',
    extra:'bi-plus-circle-fill', postre:'bi-cake2-fill'
};

document.addEventListener('DOMContentLoaded', function () {
    var cliente  = JSON.parse(localStorage.getItem('clienteHawaiiana') || 'null');
    var empleado = JSON.parse(localStorage.getItem('empleadoHawaiiana') || 'null');

    if (!empleado) {
        // Si hay sesión de cliente pero intenta acceder al admin, redirigir sin acceso
        window.location.href = 'empleado.html';
        return;
    }
    // Si además hay sesión de cliente activa, limpiarla (no pueden coexistir)
    if (cliente) localStorage.removeItem('clienteHawaiiana');
    if (empleado.cargo !== 'Gerente' && empleado.cargo !== 'Administrador') {
        mostrarErrorAcceso('No tienes permiso para acceder al panel de administración.', 'inicio.html');
        return;
    }

    _inyectarBotonModulos();
    cargarPedidosAdmin();
    cargarProductosAdmin();
    cargarEmpleadosAdmin();
    cargarPromocionesAdmin();
    configurarFormularios();
    configurarCargoCondicional();

    // Refrescar empleados cada 20 s (disponibilidad repartidor)
    setInterval(cargarEmpleadosAdmin, 20000);

    // Auto-generar reporte del día al hacer clic en el tab de Reportes
    var btnReportes = document.querySelector('[onclick*="sec-reportes"]');
    if (btnReportes) {
        btnReportes.addEventListener('click', function () {
            setTimeout(function() { generarReporte(true); }, 100);
        });
    }

    // Auto-refrescar reporte cada 30 s si está visible
    setInterval(function () {
        var secRep = document.getElementById('sec-reportes');
        if (secRep && secRep.style.display !== 'none') generarReporte(true);
    }, 30000);

    // Generar reporte del día al cargar si se viene desde Reportes directo
    if (window.location.hash === '#reportes') {
        setTimeout(function() { generarReporte(true); }, 500);
    }
});

function _inyectarBotonModulos() {
    var navDesktop = document.querySelector('.d-none.d-lg-flex');
    if (navDesktop && !document.getElementById('btn-volver-modulos')) {
        var btn = document.createElement('a');
        btn.id = 'btn-volver-modulos'; btn.href = 'inicio.html';
        btn.className = 'btn btn-sm btn-outline-warning';
        btn.innerHTML = '<i class="bi bi-grid-3x3-gap-fill"></i> Módulos';
        var btnTema = navDesktop.querySelector('#btn-tema');
        if (btnTema) navDesktop.insertBefore(btn, btnTema);
        else navDesktop.insertBefore(btn, navDesktop.firstChild);
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

function notif(msg, tipo = 'info') { if (typeof mostrarNotificacion === 'function') mostrarNotificacion(msg, tipo); else alert(msg); }
function setVal(id, v) { var el = document.getElementById(id); if (el) el.textContent = v; }

// ── Helpers de paginación ─────────────────────────────────────────────────────
function _slice(lista, est) { var desde = (est.pagina - 1) * est.porPagina; return lista.slice(desde, desde + est.porPagina); }
function _renderNav(containerId, total, est, fnCambio) {
    var cont = document.getElementById(containerId);
    if (!cont) return;
    var totalPags = Math.ceil(total / est.porPagina);
    if (totalPags <= 1) { cont.innerHTML = ''; return; }
    var desde = (est.pagina - 1) * est.porPagina + 1;
    var hasta  = Math.min(est.pagina * est.porPagina, total);
    cont.innerHTML = '<nav class="d-flex align-items-center justify-content-between mt-3 flex-wrap gap-2">' +
        '<small class="texto-secundario">' + desde + '–' + hasta + ' de ' + total + '</small>' +
        '<ul class="pagination pagination-sm mb-0">' +
        '<li class="page-item ' + (est.pagina === 1 ? 'disabled' : '') + '"><button class="page-link" onclick="' + fnCambio + '(' + (est.pagina - 1) + ')">‹ Anterior</button></li>' +
        '<li class="page-item disabled"><span class="page-link">' + est.pagina + ' / ' + totalPags + '</span></li>' +
        '<li class="page-item ' + (est.pagina === totalPags ? 'disabled' : '') + '"><button class="page-link" onclick="' + fnCambio + '(' + (est.pagina + 1) + ')">Siguiente ›</button></li>' +
        '</ul></nav>';
}

// ── PEDIDOS ───────────────────────────────────────────────────────────────────
async function cargarPedidosAdmin() {
    try {
        const res = await fetch(`${API_BASE}/pedidos`, { headers: { Accept: 'application/json' } });
        if (!res.ok) throw new Error();
        const pedidos = await res.json();
        _pedidosCache = pedidos; _pedidosActivos = pedidos; _pag.pedidos.pagina = 1;
        renderTablaPedidos(pedidos);
        actualizarContadores(pedidos);
    } catch (err) { console.error('Error al cargar pedidos:', err); }
}

function buscarPedidos() {
    var termino = (document.getElementById('buscador-pedidos')?.value || '').toLowerCase().trim();
    var filtrados = termino ? _pedidosCache.filter(p =>
        p.idPedido.toLowerCase().includes(termino) || (p.nombreCliente || '').toLowerCase().includes(termino)
    ) : _pedidosCache;
    _pag.pedidos.pagina = 1; _pedidosActivos = filtrados;
    renderTablaPedidos(filtrados);
}

function irPaginaPedidos(n) {
    var totalPags = Math.ceil(_pedidosActivos.length / _pag.pedidos.porPagina);
    if (n < 1 || n > totalPags) return;
    _pag.pedidos.pagina = n; renderTablaPedidos(_pedidosActivos);
}

function renderTablaPedidos(lista) {
    _pedidosActivos = lista;
    var tbody = document.getElementById('tabla-pedidos');
    if (!tbody) return;
    tbody.innerHTML = '';
    var pagina = _slice(lista, _pag.pedidos);
    if (!pagina.length) {
        tbody.innerHTML = '<tr><td colspan="8" class="text-center texto-secundario">No hay pedidos que coincidan.</td></tr>';
        _renderNav('paginacion-pedidos', 0, _pag.pedidos, 'irPaginaPedidos'); return;
    }
    pagina.forEach(p => {
        var info  = badgePedido(p.estado);
        var tipos = { domicilio: 'Domicilio', local: 'Mostrador' };
        var tr = document.createElement('tr');
        tr.innerHTML = `
            <td class="texto-principal fw-bold">${p.idPedido}</td>
            <td class="texto-principal">${p.nombreCliente}</td>
            <td class="precio-destacado">$${Number(p.total).toFixed(2)}</td>
            <td><span class="badge" style="background:${info.color};">${info.texto}</span></td>
            <td class="texto-secundario">${tipos[p.tipoEntrega] || p.tipoEntrega}</td>
            <td class="texto-secundario" style="font-size:.82em;">${p.idEmpleado || '—'}</td>
            <td class="texto-secundario" style="font-size:.82em;">${p.idRepartidor || '—'}</td>
            <td>${accionesPedido(p)}</td>`;
        tbody.appendChild(tr);
    });
    _renderNav('paginacion-pedidos', lista.length, _pag.pedidos, 'irPaginaPedidos');
}

function badgePedido(e) {
    var m = { 'Preparando':{color:'#fd7e14',texto:'En Preparación'}, 'En cocina':{color:'#6f42c1',texto:'En Cocina'}, 'Listo':{color:'#0dcaf0',texto:'Listo'}, 'En camino':{color:'#0dcaf0',texto:'En Camino'}, 'Entregado':{color:'#198754',texto:'Entregado'}, 'Cancelado':{color:'#dc3545',texto:'Cancelado'} };
    return m[e] || { color:'#6c757d', texto:e };
}

function accionesPedido(p) {
    var btns = `<button class="btn btn-sm btn-outline-info me-1" onclick="verDetallePedido('${p.idPedido}')"><i class="bi bi-eye-fill"></i> Ver</button>`;
    if (p.estado === 'Preparando') btns += `<button class="btn btn-sm btn-warning me-1" onclick="cambiarEstado('${p.idPedido}','En cocina')"><i class="bi bi-fire"></i></button>`;
    if (p.estado === 'En cocina')  btns += `<button class="btn btn-sm btn-warning me-1" onclick="cambiarEstado('${p.idPedido}','Listo')"><i class="bi bi-check2-circle"></i></button>`;
    if (p.estado === 'Listo')      btns += `<button class="btn btn-sm btn-info me-1" onclick="cambiarEstado('${p.idPedido}','En camino')"><i class="bi bi-truck"></i></button>`;
    if (p.estado === 'En camino')  btns += `<button class="btn btn-sm btn-success me-1" onclick="cambiarEstado('${p.idPedido}','Entregado')"><i class="bi bi-check-circle"></i></button>`;
    if (p.estado !== 'Entregado' && p.estado !== 'Cancelado') btns += `<button class="btn btn-sm btn-danger" onclick="cambiarEstado('${p.idPedido}','Cancelado')"><i class="bi bi-x-circle"></i></button>`;
    return btns;
}

async function verDetallePedido(idPedido) {
    var modal = new bootstrap.Modal(document.getElementById('modalDetallePedido'));
    setVal('dp-id', idPedido);
    document.getElementById('dp-body').innerHTML = '<div class="text-center py-4"><div class="spinner-border text-secondary"></div></div>';
    modal.show();
    try {
        const res  = await fetch(`${API_BASE}/pedidos/${idPedido}`);
        const data = await res.json();

        // Lookup empleado y armar HTML con botón de info
        var empHTML = '<span class="texto-secundario">—</span>';
        if (data.idEmpleado) {
            var empData   = _empleadosMap[data.idEmpleado];
            var empNombre = empData ? empData.nombreCompleto + ' <small class=\"texto-secundario\">(' + data.idEmpleado + ')</small>' : data.idEmpleado;
            var btnEmp    = empData
                ? ' <button class=\"btn btn-sm btn-outline-secondary ms-1\" title=\"Ver ficha del empleado\" onclick=\"verInfoEmpleado(\'' + data.idEmpleado + '\')\"><i class=\"bi bi-person-vcard-fill\"></i></button>'
                : '';
            empHTML = empNombre + btnEmp;
        }

        // Lookup repartidor y armar HTML con botón de info
        var repHTML = '<span class=\"texto-secundario\">—</span>';
        if (data.idRepartidor) {
            var empRep    = Object.values(_empleadosMap).find(function(e) { return e.idRepartidor === data.idRepartidor; });
            var repNombre = empRep ? empRep.nombreCompleto + ' <small class=\"texto-secundario\">(' + data.idRepartidor + ')</small>' : data.idRepartidor;
            var btnRep    = empRep
                ? ' <button class=\"btn btn-sm btn-outline-secondary ms-1\" title=\"Ver ficha del repartidor\" onclick=\"verInfoEmpleado(\'' + empRep.idEmpleado + '\')\"><i class=\"bi bi-person-vcard-fill\"></i></button>'
                : '';
            repHTML = repNombre + btnRep;
        }

        var dir = data.direccion;
        var dirTexto = dir
            ? `${dir.calle} #${dir.numExterior}, Col. ${dir.colonia}${dir.referencia ? ' · ' + dir.referencia : ''}`
            : 'Recoger en sucursal';

        var productosHTML = (data.detalles || []).map(d => `
            <tr>
                <td class="texto-principal">${d.nombreProducto}</td>
                <td class="texto-secundario">${d.tamanio || '—'}</td>
                <td>${d.cantidad}</td>
                <td class="precio-destacado">$${d.subtotal.toFixed(2)}</td>
                <td class="texto-secundario">${d.observaciones || '—'}</td>
            </tr>`).join('');

        document.getElementById('dp-body').innerHTML = `
            <div class="row g-3 mb-3">
                <div class="col-md-6">
                    <h6 class="texto-principal"><i class="bi bi-person-fill"></i> Cliente</h6>
                    <p class="mb-0 texto-principal">${data.nombreCliente}</p>
                    <p class="texto-secundario mb-0">${data.telefonoCliente}</p>
                </div>
                <div class="col-md-6">
                    <h6 class="texto-principal"><i class="bi bi-geo-alt-fill"></i> Entrega</h6>
                    <p class="mb-0 texto-secundario">${dirTexto}</p>
                </div>
            </div>
            <div class="row g-3 mb-3">
                <div class="col-md-6">
                    <h6 class="texto-principal"><i class="bi bi-person-badge-fill"></i> Cobrado / Atendido por</h6>
                    <p class="mb-0 texto-principal d-flex align-items-center flex-wrap gap-1">${empHTML}</p>
                </div>
                <div class="col-md-6">
                    <h6 class="texto-principal"><i class="bi bi-truck"></i> Repartidor</h6>
                    <p class="mb-0 texto-principal d-flex align-items-center flex-wrap gap-1">${repHTML}</p>
                </div>
            </div>
            <h6 class="texto-principal">Productos:</h6>
            <div class="table-responsive">
                <table class="table table-sm tarjeta-tema">
                    <thead><tr>
                        <th class="texto-principal">Producto</th><th class="texto-principal">Tamaño</th>
                        <th class="texto-principal">Cant.</th><th class="texto-principal">Subtotal</th><th class="texto-principal">Nota</th>
                    </tr></thead>
                    <tbody>${productosHTML}</tbody>
                </table>
            </div>
            <div class="d-flex justify-content-between align-items-end mt-3">
                <div>
                    <span class="texto-secundario d-block">Pago: <strong>${data.metodoPago}</strong></span>
                    <span class="texto-secundario d-block">Tipo: ${data.tipoEntrega}</span>
                    <span class="texto-secundario d-block">${data.fecha} · ${data.horaPedido}</span>
                </div>
                <h4 class="precio-destacado mb-0">$${Number(data.total).toFixed(2)}</h4>
            </div>`;
    } catch (err) {
        document.getElementById('dp-body').innerHTML = '<p class="text-danger">Error al cargar detalles.</p>';
    }
}

async function cambiarEstado(idPedido, nuevoEstado) {
    try {
        const res = await fetch(`${API_BASE}/pedidos/${idPedido}/estado`, {
            method: 'PATCH', headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
            body: JSON.stringify({ estado: nuevoEstado })
        });
        if (!res.ok) { const err = await res.json().catch(() => ({})); notif(err.mensaje || 'Error.', 'error'); return; }
        await cargarPedidosAdmin();
    } catch (err) { notif('Error de red.', 'error'); }
}

function actualizarContadores(pedidos) {
    setVal('count-preparacion', pedidos.filter(p => p.estado === 'Preparando' || p.estado === 'En cocina').length);
    setVal('count-camino',      pedidos.filter(p => p.estado === 'En camino').length);
    setVal('count-entregado',   pedidos.filter(p => p.estado === 'Entregado').length);
    var ventas = pedidos.filter(p => p.estado === 'Entregado').reduce((a, p) => a + Number(p.total), 0);
    setVal('ventas-hoy', '$' + ventas.toFixed(2));
}

// ── PRODUCTOS ─────────────────────────────────────────────────────────────────
async function cargarProductosAdmin() {
    try {
        const res = await fetch(`${API_BASE}/productos?todos=true`, { headers: { Accept: 'application/json' } });
        if (!res.ok) throw new Error();
        datosProductosCache = await res.json();
        gruposProductos = {};
        datosProductosCache.forEach(p => {
            if (!gruposProductos[p.nombre]) gruposProductos[p.nombre] = { nombre: p.nombre, categoria: p.categoria, descripcion: p.descripcion, variaciones: [] };
            gruposProductos[p.nombre].variaciones.push(p);
        });
        _pag.productos.pagina = 1;
        renderProductosAgrupados(Object.values(gruposProductos));
        poblarSelectPromociones();
    } catch (err) { console.error('Error al cargar productos:', err); }
}

function irPaginaProductos(n) {
    var lista = Object.values(gruposProductos);
    var totalPags = Math.ceil(lista.length / _pag.productos.porPagina);
    if (n < 1 || n > totalPags) return;
    _pag.productos.pagina = n; renderProductosAgrupados(lista);
}

function renderProductosAgrupados(lista) {
    var cont = document.getElementById('lista-productos');
    if (!cont) return;
    cont.innerHTML = '';
    var pagina = _slice(lista, _pag.productos);
    pagina.forEach(grp => {
        var grupoActivo = grp.variaciones.some(v => v.activo);
        var iconoCls    = ICONOS_ADMIN[(grp.categoria || '').toLowerCase()] || 'bi-box-fill';
        var variacionesHTML = grp.variaciones.map(v => `
            <div class="d-flex justify-content-between align-items-center border-bottom border-secondary py-1" style="opacity:${v.activo?'1':'0.4'};">
                <span class="texto-principal" style="font-size:0.85em;">${v.tamanio||'Único'} - <span class="precio-destacado">$${v.precio}</span></span>
                <button class="btn btn-sm p-0 ${v.activo?'text-danger':'text-success'}" onclick="toggleProducto('${v.idProducto}')">
                    <i class="bi ${v.activo?'bi-eye-slash-fill':'bi-eye-fill'}"></i></button>
            </div>`).join('');
        var col = document.createElement('div');
        col.className = 'col-md-6 col-lg-4 col-xl-3 mb-4';
        col.innerHTML = `
            <div class="tarjeta-tema p-3 h-100 d-flex flex-column" style="opacity:${grupoActivo?'1':'0.5'};border-top:4px solid var(--color-acento);">
                <div class="d-flex justify-content-between align-items-start mb-2">
                    <h5 class="texto-principal mb-0"><i class="bi ${iconoCls}"></i> ${grp.nombre}</h5>
                    <button class="btn btn-sm btn-outline-warning p-1" style="font-size:0.75em;" onclick="editarGrupo('${grp.nombre.replace(/'/g,"\\'")}')"><i class="bi bi-pencil"></i></button>
                </div>
                <p class="texto-secundario mb-2" style="font-size:.8em;">${grp.descripcion||'—'}</p>
                <div class="flex-grow-1 mb-3"><strong class="texto-secundario d-block mb-1" style="font-size:0.75em;">TAMAÑOS Y PRECIOS:</strong>${variacionesHTML}</div>
                <button class="btn btn-sm w-100 ${grupoActivo?'btn-outline-danger':'btn-outline-success'}" onclick="toggleGrupoEntero('${grp.nombre.replace(/'/g,"\\'")}',${grupoActivo})">
                    <i class="bi bi-power"></i> ${grupoActivo?'Desactivar Completo':'Activar Completo'}</button>
            </div>`;
        cont.appendChild(col);
    });
    _renderNav('paginacion-productos', lista.length, _pag.productos, 'irPaginaProductos');
}

async function toggleProducto(id) {
    try { await fetch(`${API_BASE}/productos/${id}/toggle-activo`, { method: 'PATCH' }); await cargarProductosAdmin(); }
    catch (err) { notif('Error al cambiar estado.', 'error'); }
}
async function toggleGrupoEntero(nombre, desactivar) {
    var targets = gruposProductos[nombre].variaciones;
    for (var i = 0; i < targets.length; i++) {
        if (targets[i].activo === desactivar) {
            try { await fetch(`${API_BASE}/productos/${targets[i].idProducto}/toggle-activo`, { method: 'PATCH' }); } catch (e) {}
        }
    }
    await cargarProductosAdmin();
}
function toggleTamanosProd() {
    var sel = document.getElementById('prod-tiene-tamanos').value;
    document.getElementById('sec-precio-unico').style.display  = sel === 'no' ? 'block' : 'none';
    document.getElementById('sec-multi-tamanos').style.display = sel === 'si' ? 'block' : 'none';
}
function toggleInputPrecio(chk, inputId) { var input = document.getElementById(inputId); input.disabled = !chk.checked; if (!chk.checked) input.value = ''; }
async function editarGrupo(nombre) {
    var grp = gruposProductos[nombre];
    document.getElementById('prod-nombre').value = grp.nombre;
    document.getElementById('prod-categoria').value = grp.categoria;
    document.getElementById('prod-descripcion').value = grp.descripcion || '';
    document.getElementById('prod-tiene-tamanos').parentElement.style.display = 'none';
    document.getElementById('sec-precio-unico').style.display = 'none';
    document.getElementById('sec-multi-tamanos').style.display = 'none';
    document.getElementById('formularioProducto').dataset.editandoNombre = nombre;
    document.querySelector('#modalProducto .modal-title').textContent = 'Editar Información Global';
    new bootstrap.Modal(document.getElementById('modalProducto')).show();
}

// ── EMPLEADOS ─────────────────────────────────────────────────────────────────
async function cargarEmpleadosAdmin() {
    try {
        const res = await fetch(`${API_BASE}/empleados?todos=true`);
        if (!res.ok) throw new Error();
        const empleados = await res.json();
        _empleadosActivos = empleados;
        // Poblar el mapa para lookups
        _empleadosMap = {};
        empleados.forEach(e => { _empleadosMap[e.idEmpleado] = e; });
        _pag.empleados.pagina = 1;
        renderEmpleados(empleados);
    } catch (err) { console.error('Error al cargar empleados:', err); }
}

function irPaginaEmpleados(n) {
    var totalPags = Math.ceil(_empleadosActivos.length / _pag.empleados.porPagina);
    if (n < 1 || n > totalPags) return;
    _pag.empleados.pagina = n; renderEmpleados(_empleadosActivos);
}

function renderEmpleados(lista) {
    _empleadosActivos = lista;
    var tbody = document.getElementById('tabla-empleados');
    if (!tbody) return;
    tbody.innerHTML = '';
    var pagina = _slice(lista, _pag.empleados);
    if (!pagina.length) { tbody.innerHTML = '<tr><td colspan="6" class="text-center texto-secundario">Sin empleados.</td></tr>'; _renderNav('paginacion-empleados', 0, _pag.empleados, 'irPaginaEmpleados'); return; }
    pagina.forEach(emp => {
        var tr = document.createElement('tr');
        tr.style.opacity = emp.activo ? '1' : '0.5';
        var repartidorHTML = '';
        if (emp.cargo === 'Repartidor') {
            var placa    = emp.placaMoto            ? `<span class="badge bg-secondary me-1"><i class="bi bi-scooter"></i> ${emp.placaMoto}</span>` : '';
            var estado   = emp.estadoDisponibilidad ? `<span class="badge bg-info text-dark me-1">${emp.estadoDisponibilidad}</span>` : '';
            var servicio = emp.servicioExterno && emp.servicioExterno !== 'Interno' ? `<span class="badge bg-warning text-dark">${emp.servicioExterno}</span>` : '';
            repartidorHTML = `<div class="mt-1">${placa}${estado}${servicio}</div>`;
        }
        tr.innerHTML = `
            <td class="texto-principal fw-bold">${emp.nombreCompleto}</td>
            <td class="texto-principal"><span class="badge bg-dark">${emp.cargo}</span>${repartidorHTML}</td>
            <td class="texto-principal">${emp.telefono}</td>
            <td class="precio-destacado">$${Number(emp.sueldo).toLocaleString('es-MX')}</td>
            <td class="texto-secundario">${emp.horario||'—'}</td>
            <td>
                <button class="btn btn-sm btn-outline-primary me-1" onclick="abrirEdicionEmpleado('${emp.idEmpleado}')"><i class="bi bi-pencil"></i></button>
                ${emp.activo
                    ? `<button class="btn btn-sm btn-outline-danger" onclick="bajaEmpleado('${emp.idEmpleado}')">Baja</button>`
                    : `<button class="btn btn-sm btn-outline-success" onclick="reactivarEmpleado('${emp.idEmpleado}')">Reactivar</button>`}
            </td>`;
        tbody.appendChild(tr);
    });
    _renderNav('paginacion-empleados', lista.length, _pag.empleados, 'irPaginaEmpleados');
}

function abrirEdicionEmpleado(idEmpleado) {
    var emp = _empleadosMap[idEmpleado];
    if (!emp) return;
    var setVal = (id, v) => { var el = document.getElementById(id); if (el) el.value = v || ''; };
    setVal('emp-nombre',    emp.nombre);
    setVal('emp-apPaterno', emp.apPaterno);
    setVal('emp-apMaterno', emp.apMaterno);
    setVal('emp-cargo',     emp.cargo);
    setVal('emp-telefono',  emp.telefono);
    setVal('emp-sueldo',    emp.sueldo);
    setVal('emp-horario',   emp.horario || '');
    // Mostrar placa y servicio si es Repartidor
    var secPlaca    = document.getElementById('sec-placa-moto');
    var secTipoServ = document.getElementById('sec-tipo-servicio');
    var isRep = emp.cargo === 'Repartidor';
    if (secPlaca)    secPlaca.style.display    = isRep ? 'block' : 'none';
    if (secTipoServ) secTipoServ.style.display = isRep ? 'block' : 'none';
    if (isRep) {
        setVal('emp-placaMoto', emp.placaMoto || '');
        // Pre-seleccionar tipo de servicio
        var esExterno  = emp.servicioExterno && emp.servicioExterno !== 'Interno';
        var radInterno = document.getElementById('servicio-interno');
        var radExterno = document.getElementById('servicio-externo-radio');
        if (radInterno) radInterno.checked = !esExterno;
        if (radExterno) radExterno.checked  = esExterno;
        if (esExterno) {
            setVal('emp-servicioExterno', emp.servicioExterno || '');
            var secNombre = document.getElementById('sec-nombre-servicio');
            if (secNombre) secNombre.style.display = 'block';
        } else {
            var secNombre = document.getElementById('sec-nombre-servicio');
            if (secNombre) secNombre.style.display = 'none';
        }
    }
    var form = document.getElementById('formularioEmpleado');
    form.dataset.editandoId = idEmpleado;
    document.querySelector('#modalEmpleado .modal-title').textContent = 'Editar Empleado';
    new bootstrap.Modal(document.getElementById('modalEmpleado')).show();
}

async function bajaEmpleado(id) {
    if (!confirm('¿Dar de baja a este empleado?')) return;
    try {
        const res = await fetch(`${API_BASE}/empleados/${id}/baja`, { method: 'PATCH' });
        if (res.status === 400) { const err = await res.json(); notif(err.mensaje || 'No se puede dar de baja.', 'error'); return; }
        await cargarEmpleadosAdmin();
    } catch (err) { notif('Error al procesar la baja.', 'error'); }
}
async function reactivarEmpleado(id) {
    try { await fetch(`${API_BASE}/empleados/${id}/reactivar`, { method: 'PATCH' }); await cargarEmpleadosAdmin(); }
    catch (err) { notif('Error al reactivar.', 'error'); }
}

function configurarCargoCondicional() {
    var selectCargo = document.getElementById('emp-cargo');
    var secPlaca    = document.getElementById('sec-placa-moto');
    var secTipoServ = document.getElementById('sec-tipo-servicio');
    if (!selectCargo || !secPlaca) return;

    function actualizarVisibilidad() {
        var isRep = selectCargo.value === 'Repartidor';
        secPlaca.style.display = isRep ? 'block' : 'none';
        if (secTipoServ) secTipoServ.style.display = isRep ? 'block' : 'none';
        if (!isRep) {
            document.getElementById('emp-placaMoto').value = '';
            var inputExt = document.getElementById('emp-servicioExterno');
            if (inputExt) inputExt.value = '';
            var radInterno = document.getElementById('servicio-interno');
            if (radInterno) { radInterno.checked = true; toggleServicioExterno(); }
        }
    }

    actualizarVisibilidad();
    selectCargo.addEventListener('change', actualizarVisibilidad);
}

// ── PROMOCIONES ───────────────────────────────────────────────────────────────
async function cargarPromocionesAdmin() {
    try {
        const res = await fetch(`${API_BASE}/promociones`);
        const promos = await res.json();
        renderPromociones(promos);
    } catch (err) { console.error('Error al cargar promociones:', err); }
}
// Agrupa las promociones por nombre → una sola fila por campaña
function renderPromociones(promos) {
    var tbody = document.getElementById('tabla-promociones');
    if (!tbody) return;
    tbody.innerHTML = '';

    // Agrupar por nombre de promoción
    var grupos = {};
    promos.forEach(function(pr) {
        if (!grupos[pr.nombre]) {
            grupos[pr.nombre] = {
                nombre: pr.nombre, porcentajeDes: pr.porcentajeDes,
                fechaInicio: pr.fechaInicio, fechaFin: pr.fechaFin,
                condiciones: pr.condiciones || 'Ambos',
                vigente: false, productos: [], ids: [], idProductos: []
            };
        }
        if (!grupos[pr.nombre].productos.includes(pr.nombreProducto))
            grupos[pr.nombre].productos.push(pr.nombreProducto);
        grupos[pr.nombre].ids.push(pr.idPromocion);
        grupos[pr.nombre].idProductos.push(pr.idProducto);
        grupos[pr.nombre].condiciones = pr.condiciones || grupos[pr.nombre].condiciones;
        if (pr.vigente) grupos[pr.nombre].vigente = true;
    });

    Object.values(grupos).forEach(function(grp) {
        var productosHTML = grp.productos.map(function(p) {
            return '<span class="badge bg-secondary me-1 mb-1"><i class="bi bi-circle-fill texto-acento me-1"></i>' + p + '</span>';
        }).join('');
        // Pasar ids como string codificado para el onclick
        var idsStr = grp.ids.join(',');

        // Serializar datos del grupo para el modal de ver detalles
        var grpParaVer = {
            nombre: grp.nombre, porcentajeDes: grp.porcentajeDes,
            fechaInicio: grp.fechaInicio, fechaFin: grp.fechaFin,
            condiciones: grp.condiciones || 'Ambos', vigente: grp.vigente,
            // Para edición: idProducto real por cada producto
            productosEdicion: grp.productos.map(function(nombre, i) {
                return { id: grp.idProductos[i] || '', nombre: nombre };
            }),
            productos: grp.productos.map(function(nombre, i) {
                var precio = 0;
                if (datosProductosCache.length) {
                    var prodEncontrado = datosProductosCache.find(function(p) { return p.nombre === nombre; });
                    if (prodEncontrado) precio = prodEncontrado.precio;
                }
                return { nombre: nombre, precio: precio, tamanio: 'Único' };
            })
        };
        // Serializar de forma segura para pasar al onclick
        var grpJson = encodeURIComponent(JSON.stringify(grpParaVer));

        var tr = document.createElement('tr');
        tr.innerHTML =
            '<td class="texto-principal fw-bold">' + grp.nombre + '</td>' +
            '<td>' + productosHTML + '</td>' +
            '<td class="text-danger fw-bold">-' + grp.porcentajeDes + '%</td>' +
            '<td class="texto-secundario">' + grp.fechaInicio + '</td>' +
            '<td class="texto-secundario">' + grp.fechaFin + '</td>' +
            '<td class="d-flex gap-1 align-items-center">' +
                '<span class="badge ' + (grp.vigente ? 'bg-success' : 'bg-secondary') + ' me-1">' + (grp.vigente ? 'Vigente' : 'Expirada') + '</span>' +
                '<button class="btn btn-sm btn-outline-info" title="Ver detalles" onclick="verDetallePromocion(\'' + grpJson + '\')">' +
                '<i class="bi bi-eye-fill"></i></button>' +
                '<button class="btn btn-sm ' + (grp.vigente ? 'btn-outline-warning' : 'btn-outline-success') + '" title="' + (grp.vigente ? 'Editar' : 'Reactivar') + '" onclick="editarPromocion(\'' + idsStr + '\',\'' + grpJson + '\')">' +
                '<i class="bi ' + (grp.vigente ? 'bi-pencil-fill' : 'bi-arrow-clockwise') + '"></i> ' + (grp.vigente ? 'Editar' : 'Reactivar') + '</button>' +
                '<button class="btn btn-sm btn-outline-danger" title="Eliminar" onclick="eliminarPromocionGrupo(\'' + idsStr + '\')">' +
                '<i class="bi bi-trash3"></i></button>' +
            '</td>';
        tbody.appendChild(tr);
    });
}

// Elimina todos los registros de una campaña (pueden ser varios productos/tamaños)
async function eliminarPromocionGrupo(idsStr) {
    if (!confirm('¿Eliminar esta promoción y todos sus productos asociados?')) return;
    try {
        var ids = idsStr.split(',');
        for (var i = 0; i < ids.length; i++) {
            await fetch(API_BASE + '/promociones/' + ids[i], { method: 'DELETE' });
        }
        await cargarPromocionesAdmin();
        notif('Promoción eliminada correctamente.', 'success');
    } catch (err) { notif('Error al eliminar.', 'error'); }
}


// Abre el modal de promoción pre-relleno para editar o reactivar una campaña
function editarPromocion(idsStr, grpJson) {
    var grp = JSON.parse(decodeURIComponent(grpJson));
    _editandoPromoIds = idsStr.split(',');

    // Rellenar campos del formulario
    document.getElementById('promo-nombre').value     = grp.nombre;
    document.getElementById('promo-descuento').value  = grp.porcentajeDes;
    var inputCond = document.getElementById('promo-condiciones');
    if (inputCond) inputCond.value = grp.condiciones || 'Ambos';

    // Convertir fecha al formato yyyy-MM-dd que espera el input[type=date]
    function aFormatoInput(fechaStr) {
        if (!fechaStr) return '';
        // Si viene como dd/MM/yyyy → convertir
        var partes = fechaStr.split('/');
        if (partes.length === 3) return partes[2] + '-' + partes[1] + '-' + partes[0];
        // Si ya viene como yyyy-MM-dd devolver tal cual
        return fechaStr;
    }
    document.getElementById('promo-inicio').value = aFormatoInput(grp.fechaInicio);
    // Para reactivar: si la promo ya expiró, proponer hoy como nuevo inicio
    if (!grp.vigente) {
        var hoy = new Date().toISOString().split('T')[0];
        document.getElementById('promo-inicio').value = hoy;
        document.getElementById('promo-fin').value    = '';   // obliga a elegir nueva fecha fin
    } else {
        document.getElementById('promo-fin').value = aFormatoInput(grp.fechaFin);
    }

    // Pre-cargar productos seleccionados
    _productosPromo = (grp.productosEdicion || []).filter(function(p) { return p.id; });
    renderListaProductosPromo();

    // Actualizar título del modal
    var titulo = document.querySelector('#modalPromocion .modal-title');
    if (titulo) titulo.textContent = grp.vigente ? 'Editar Promoción' : 'Reactivar Promoción';

    new bootstrap.Modal(document.getElementById('modalPromocion')).show();
}

// Muestra/oculta el campo de nombre de servicio según tipo seleccionado
function toggleServicioExterno() {
    var tipoSeleccionado = document.querySelector('[name="servicio-tipo"]:checked')?.value || 'Interno';
    var secNombre = document.getElementById('sec-nombre-servicio');
    if (secNombre) secNombre.style.display = tipoSeleccionado === 'Externo' ? 'block' : 'none';
    if (tipoSeleccionado !== 'Externo') {
        var inputExt = document.getElementById('emp-servicioExterno');
        if (inputExt) inputExt.value = '';
    }
}

// Ver detalles completos de una campaña de promoción
function verDetallePromocion(grupoJson) {
    var grp = JSON.parse(decodeURIComponent(grupoJson));
    setVal('vp-nombre', grp.nombre);

    // Construir tabla de productos con precios originales y descontados
    var filasHTML = grp.productos.map(function(prod) {
        var precioOrig = prod.precio;
        var precioDesc = Math.round(precioOrig * (1 - grp.porcentajeDes / 100) * 100) / 100;
        return '<tr>' +
            '<td class="texto-principal">' + prod.nombre + '</td>' +
            '<td class="texto-secundario">' + (prod.tamanio && prod.tamanio !== 'Único' ? prod.tamanio : '—') + '</td>' +
            '<td class="texto-secundario text-decoration-line-through">$' + precioOrig.toFixed(2) + '</td>' +
            '<td class="precio-destacado">$' + precioDesc.toFixed(2) + '</td>' +
            '</tr>';
    }).join('');

    document.getElementById('vp-body').innerHTML =
        '<div class="d-flex align-items-center gap-3 mb-4">' +
        '<span class="badge bg-danger" style="font-size:1.1em;">-' + grp.porcentajeDes + '%</span>' +
        '<span class="badge ' + (grp.vigente ? 'bg-success' : 'bg-secondary') + '">' + (grp.vigente ? 'Vigente' : 'Expirada') + '</span>' +
        '<small class="texto-secundario">Del ' + grp.fechaInicio + ' al ' + grp.fechaFin + '</small>' +
        '</div>' +
        '<div class="table-responsive">' +
        '<table class="table table-sm tarjeta-tema">' +
        '<thead><tr>' +
        '<th class="texto-principal">Producto</th>' +
        '<th class="texto-principal">Tamaño</th>' +
        '<th class="texto-principal">Precio original</th>' +
        '<th class="texto-principal">Precio promo</th>' +
        '</tr></thead>' +
        '<tbody>' + filasHTML + '</tbody>' +
        '</table></div>';

    new bootstrap.Modal(document.getElementById('modalVerPromocion')).show();
}


// Abre una tarjeta modal con la información completa del empleado
function verInfoEmpleado(idEmpleado) {
    var emp = _empleadosMap[idEmpleado];
    if (!emp) { notif('Información del empleado no disponible.', 'warning'); return; }

    var repartidorHTML = '';
    if (emp.cargo === 'Repartidor') {
        var badgeServicio = emp.servicioExterno === 'Interno' || !emp.servicioExterno
            ? '<span class="badge bg-secondary">Interno</span>'
            : '<span class="badge bg-warning text-dark"><i class="bi bi-phone"></i> ' + emp.servicioExterno + '</span>';
        repartidorHTML =
            '<div class="border-top mt-3 pt-3">' +
            '<h6 class="texto-principal mb-2"><i class="bi bi-truck"></i> Datos de Repartidor</h6>' +
            '<div class="row g-2">' +
            '<div class="col-6"><p class="texto-secundario small mb-0">ID Repartidor</p><p class="texto-principal fw-bold mb-0">' + (emp.idRepartidor || '—') + '</p></div>' +
            '<div class="col-6"><p class="texto-secundario small mb-0">Vehículo / Placa</p><p class="texto-principal fw-bold mb-0">' + (emp.placaMoto || '—') + '</p></div>' +
            '<div class="col-12"><p class="texto-secundario small mb-0">Servicio</p><p class="mb-0">' + badgeServicio + '</p></div>' +
            '<div class="col-6"><p class="texto-secundario small mb-0">Disponibilidad</p><p class="mb-0"><span class="badge ' + (emp.estadoDisponibilidad === 'Disponible' ? 'bg-success' : 'bg-warning text-dark') + '">' + (emp.estadoDisponibilidad || 'Disponible') + '</span></p></div>' +
            '</div></div>';
    }

    document.getElementById('emp-info-body').innerHTML =
        '<div class="d-flex align-items-center gap-3 mb-4">' +
        '<div class="d-flex align-items-center justify-content-center rounded-circle bg-secondary" style="width:52px;height:52px;font-size:1.5rem;color:white;flex-shrink:0;">' +
        '<i class="bi bi-person-fill"></i></div>' +
        '<div><h5 class="mb-1 texto-principal">' + emp.nombreCompleto + '</h5>' +
        '<span class="badge bg-dark me-1">' + emp.cargo + '</span>' +
        (emp.activo ? '<span class="badge bg-success">Activo</span>' : '<span class="badge bg-danger">Inactivo</span>') +
        '</div></div>' +
        '<div class="row g-3">' +
        '<div class="col-6"><p class="texto-secundario small mb-0">ID Empleado</p><p class="texto-principal fw-bold mb-0">' + emp.idEmpleado + '</p></div>' +
        '<div class="col-6"><p class="texto-secundario small mb-0">Teléfono</p><p class="texto-principal fw-bold mb-0">' + (emp.telefono || '—') + '</p></div>' +
        '<div class="col-6"><p class="texto-secundario small mb-0">Sueldo</p><p class="precio-destacado mb-0">$' + Number(emp.sueldo || 0).toLocaleString('es-MX') + '</p></div>' +
        '<div class="col-6"><p class="texto-secundario small mb-0">Horario</p><p class="texto-principal fw-bold mb-0">' + (emp.horario || '—') + '</p></div>' +
        '</div>' +
        repartidorHTML;

    new bootstrap.Modal(document.getElementById('modalInfoEmpleado')).show();
}

function poblarSelectPromociones() {
    var sel = document.getElementById('promo-producto');
    if (!sel) return;
    sel.innerHTML = '<option value="">-- Selecciona un producto --</option>';
    Object.keys(gruposProductos).sort().forEach(nombre => {
        var o = document.createElement('option'); o.value = nombre; o.textContent = nombre; sel.appendChild(o);
    });
}
function cambioProductoPromo() {
    var selProducto = document.getElementById('promo-producto').value;
    var secTamanio  = document.getElementById('sec-promo-tamanio');
    var selTamanio  = document.getElementById('promo-tamanio');
    if (!selProducto) { secTamanio.style.display = 'none'; return; }
    var grp = gruposProductos[selProducto];
    if (grp.variaciones.length > 1) {
        selTamanio.innerHTML = '<option value="todos">Todos los tamaños</option>';
        grp.variaciones.forEach(v => { selTamanio.innerHTML += `<option value="${v.idProducto}">${v.tamanio} ($${v.precio})</option>`; });
        secTamanio.style.display = 'block';
    } else {
        secTamanio.style.display = 'none';
        selTamanio.innerHTML = `<option value="${grp.variaciones[0].idProducto}">Único</option>`;
    }
}

// Agrega el producto/tamaño seleccionado a la lista de la promoción
function agregarProductoAPromo() {
    var selProducto = document.getElementById('promo-producto').value;
    if (!selProducto) { notif('Selecciona un producto primero.', 'warning'); return; }
    var grp = gruposProductos[selProducto];
    var selTamanio  = document.getElementById('promo-tamanio');
    var targets = [];
    if (grp.variaciones.length > 1 && selTamanio.style.display !== 'none') {
        if (selTamanio.value === 'todos') {
            grp.variaciones.forEach(v => targets.push({ id: v.idProducto, nombre: selProducto + ' (' + v.tamanio + ')' }));
        } else {
            var txt = selTamanio.options[selTamanio.selectedIndex]?.text || '';
            targets.push({ id: selTamanio.value, nombre: selProducto + ' (' + txt + ')' });
        }
    } else {
        targets.push({ id: grp.variaciones[0].idProducto, nombre: selProducto });
    }
    targets.forEach(t => { if (!_productosPromo.find(p => p.id === t.id)) _productosPromo.push(t); });
    renderListaProductosPromo();
    // Resetear selector
    document.getElementById('promo-producto').value = '';
    document.getElementById('sec-promo-tamanio').style.display = 'none';
}

function renderListaProductosPromo() {
    var cont = document.getElementById('lista-productos-promo');
    if (!cont) return;
    if (!_productosPromo.length) { cont.innerHTML = ''; return; }
    cont.innerHTML = '<div class="border rounded p-2 mt-1">' +
        _productosPromo.map((p, i) =>
            '<div class="d-flex justify-content-between align-items-center py-1">' +
            '<small class="texto-principal"><i class="bi bi-check-circle-fill text-success me-1"></i>' + p.nombre + '</small>' +
            '<button type="button" class="btn btn-sm btn-outline-danger p-0 px-1" onclick="quitarProductoPromo(' + i + ')"><i class="bi bi-x"></i></button></div>'
        ).join('') + '</div>';
}
function quitarProductoPromo(idx) { _productosPromo.splice(idx, 1); renderListaProductosPromo(); }

// ── REPORTES ──────────────────────────────────────────────────────────────────
async function generarReporte(silencioso) {
    var hoy    = new Date().toISOString().split('T')[0];
    var iniEl  = document.getElementById('fecha-inicio');
    var finEl  = document.getElementById('fecha-fin');
    // Auto-rellenar con hoy si no hay fechas
    if (iniEl && !iniEl.value) iniEl.value = hoy;
    if (finEl && !finEl.value) finEl.value = hoy;
    var inicio = iniEl ? iniEl.value : hoy;
    var fin    = finEl ? finEl.value : hoy;
    if (!inicio || !fin) { if (!silencioso) notif('Selecciona un rango de fechas.', 'warning'); return; }
    try {
        const res = await fetch(`${API_BASE}/pedidos?estado=Entregado`);
        const pedidos = await res.json();
        var filtrados = pedidos.filter(p => { var f = new Date(p.fecha.split('/').reverse().join('-')); return f >= new Date(inicio) && f <= new Date(fin); });
        var total = filtrados.reduce((a, p) => a + Number(p.total), 0);
        var por = { efectivo:0, tarjeta:0, transferencia:0 };
        filtrados.forEach(p => { if (por[p.metodoPago] !== undefined) por[p.metodoPago] += Number(p.total); });
        var dom = filtrados.filter(p => (p.tipoEntrega||'').toLowerCase() === 'domicilio').reduce((a,p) => a+Number(p.total), 0);
        setVal('reporte-efectivo','$'+por.efectivo.toFixed(2)); setVal('reporte-tarjeta','$'+por.tarjeta.toFixed(2));
        setVal('reporte-transferencia','$'+por.transferencia.toFixed(2)); setVal('reporte-domicilio','$'+dom.toFixed(2));
        setVal('reporte-mostrador','$'+(total-dom).toFixed(2)); setVal('reporte-total','$'+total.toFixed(2));
        var lblActualizado = document.getElementById('lbl-reporte-actualizado');
        if (lblActualizado) lblActualizado.textContent = 'Actualizado: ' + new Date().toLocaleTimeString('es-MX', {hour:'2-digit',minute:'2-digit',second:'2-digit'});
        if (!silencioso) notif('Reporte generado: ' + filtrados.length + ' pedidos.', 'success');
    } catch (err) { notif('No se pudo generar el reporte.', 'error'); }
}

// ── FORMULARIOS ───────────────────────────────────────────────────────────────
function configurarFormularios() {
    // Producto
    var fProd = document.getElementById('formularioProducto');
    if (fProd) fProd.addEventListener('submit', async function (e) {
        e.preventDefault();
        var nombre = document.getElementById('prod-nombre').value.trim();
        var cat    = document.getElementById('prod-categoria').value;
        var desc   = document.getElementById('prod-descripcion').value.trim();
        var editandoNombre = this.dataset.editandoNombre;
        var btn = document.getElementById('btn-guardar-prod');
        btn.innerHTML = '<span class="spinner-border spinner-border-sm"></span>'; btn.disabled = true;
        try {
            if (editandoNombre) {
                for (var v of gruposProductos[editandoNombre].variaciones) {
                    await fetch(`${API_BASE}/productos/${v.idProducto}`, { method:'PUT', headers:{'Content-Type':'application/json'}, body:JSON.stringify({nombre,categoria:cat,descripcion:desc,precio:v.precio,tamanio:v.tamanio}) });
                }
            } else {
                var tieneTam = document.getElementById('prod-tiene-tamanos').value;
                if (tieneTam === 'no') {
                    var pre = parseFloat(document.getElementById('prod-precio').value);
                    await fetch(`${API_BASE}/productos`, {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({nombre,categoria:cat,precio:pre,descripcion:desc,tamanio:null})});
                } else {
                    var checks = document.querySelectorAll('.chk-tamano:checked');
                    if (!checks.length) { alert('Selecciona al menos un tamaño.'); btn.innerHTML='Guardar'; btn.disabled=false; return; }
                    for (var chk of checks) {
                        var inputPre = document.getElementById(chk.id.replace('chk-','precio-'));
                        await fetch(`${API_BASE}/productos`, {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({nombre,categoria:cat,precio:parseFloat(inputPre.value),descripcion:desc,tamanio:chk.value})});
                    }
                }
            }
            delete this.dataset.editandoNombre;
            document.getElementById('prod-tiene-tamanos').parentElement.style.display = 'block';
            toggleTamanosProd();
            document.querySelector('#modalProducto .modal-title').textContent = 'Nuevo Producto';
            await cargarProductosAdmin();
            bootstrap.Modal.getInstance(document.getElementById('modalProducto')).hide();
            this.reset(); document.querySelectorAll('.input-precio-tam').forEach(inp => { inp.disabled=true; inp.value=''; });
            notif('Guardado correctamente', 'success');
        } catch (err) { notif('Error al guardar.', 'error'); }
        finally { btn.innerHTML='Guardar'; btn.disabled=false; }
    });
    document.getElementById('modalProducto')?.addEventListener('hidden.bs.modal', function () {
        var f = document.getElementById('formularioProducto'); delete f.dataset.editandoNombre;
        document.getElementById('prod-tiene-tamanos').parentElement.style.display = 'block';
        f.reset(); toggleTamanosProd();
        document.querySelectorAll('.input-precio-tam').forEach(inp => { inp.disabled=true; inp.value=''; });
    });

    // Empleado — maneja tanto CREATE (POST) como EDIT (PUT)
    var fEmp = document.getElementById('formularioEmpleado');
    if (fEmp) fEmp.addEventListener('submit', async function (e) {
        e.preventDefault();
        var editandoId = this.dataset.editandoId;
        var cargoEl    = document.getElementById('emp-cargo').value;
        var placaVal   = cargoEl === 'Repartidor' ? (document.getElementById('emp-placaMoto').value.trim()) : null;

        if (cargoEl === 'Repartidor' && !placaVal) {
            notif('La placa de moto es obligatoria para el cargo Repartidor.', 'warning'); return;
        }

        // Determinar servicio externo si es Repartidor
        var servicioExternoVal = null;
        if (cargoEl === 'Repartidor') {
            var tipoServ = document.querySelector('[name="servicio-tipo"]:checked')?.value || 'Interno';
            if (tipoServ === 'Externo') {
                var nombreServicio = (document.getElementById('emp-servicioExterno')?.value || '').trim();
                if (!nombreServicio) { notif('Ingresa el nombre del servicio externo.', 'warning'); return; }
                servicioExternoVal = nombreServicio;
            } else {
                servicioExternoVal = 'Interno';
            }
        }

        var dto = {
            nombre:          document.getElementById('emp-nombre').value.trim(),
            apPaterno:       document.getElementById('emp-apPaterno').value.trim(),
            apMaterno:       document.getElementById('emp-apMaterno').value.trim(),
            telefono:        document.getElementById('emp-telefono').value.trim(),
            sueldo:          parseFloat(document.getElementById('emp-sueldo').value),
            cargo:           cargoEl,
            horario:         document.getElementById('emp-horario').value.trim(),
            placaMoto:       placaVal,
            servicioExterno: servicioExternoVal
        };

        try {
            var url    = editandoId ? `${API_BASE}/empleados/${editandoId}` : `${API_BASE}/empleados`;
            var method = editandoId ? 'PUT' : 'POST';
            const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(dto) });
            if (!res.ok) {
                const errData = await res.json().catch(() => ({}));
                notif(errData.mensaje || 'Error al guardar el empleado.', 'error'); return;
            }
            await cargarEmpleadosAdmin();
            bootstrap.Modal.getInstance(document.getElementById('modalEmpleado')).hide();
            notif(editandoId ? 'Empleado actualizado.' : 'Empleado creado.', 'success');
        } catch (err) { notif('Error de conexión.', 'error'); }
    });
    document.getElementById('modalEmpleado')?.addEventListener('hidden.bs.modal', function () {
        var f = document.getElementById('formularioEmpleado');
        delete f.dataset.editandoId;
        document.querySelector('#modalEmpleado .modal-title').textContent = 'Nuevo Empleado';
        f.reset();
        var secPlaca    = document.getElementById('sec-placa-moto');
        var secTipoServ = document.getElementById('sec-tipo-servicio');
        var secNombre   = document.getElementById('sec-nombre-servicio');
        if (secPlaca)    secPlaca.style.display    = 'none';
        if (secTipoServ) secTipoServ.style.display = 'none';
        if (secNombre)   secNombre.style.display   = 'none';
        // Reset radio a Interno
        var radInterno = document.getElementById('servicio-interno');
        if (radInterno) radInterno.checked = true;
    });

    // Promoción — permite múltiples productos
    var fPromo = document.getElementById('formularioPromocion');
    if (fPromo) fPromo.addEventListener('submit', async function (e) {
        e.preventDefault();
        var nombrePromo = document.getElementById('promo-nombre').value.trim();
        var desc        = parseInt(document.getElementById('promo-descuento').value);
        var fIni        = document.getElementById('promo-inicio').value;
        var fFin        = document.getElementById('promo-fin').value;

        if (!_productosPromo.length) { notif('Agrega al menos un producto a la promoción.', 'warning'); return; }

        var btn = document.getElementById('btn-guardar-promo');
        btn.innerHTML = '<span class="spinner-border spinner-border-sm"></span>'; btn.disabled = true;
        var esEdicion = _editandoPromoIds.length > 0;
        try {
            // Si estamos editando/reactivando: borrar los registros anteriores primero
            if (esEdicion) {
                for (var j = 0; j < _editandoPromoIds.length; j++) {
                    await fetch(API_BASE + '/promociones/' + _editandoPromoIds[j], { method: 'DELETE' });
                }
                _editandoPromoIds = [];
            }
            var totalProductos = _productosPromo.length;
            for (var i = 0; i < _productosPromo.length; i++) {
                await fetch(`${API_BASE}/promociones`, {
                    method: 'POST', headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ nombre: nombrePromo, idProducto: _productosPromo[i].id, porcentajeDes: desc, fechaInicio: fIni, fechaFin: fFin, condiciones: condiciones })
                });
            }
            _productosPromo = []; renderListaProductosPromo();
            await cargarPromocionesAdmin();
            bootstrap.Modal.getInstance(document.getElementById('modalPromocion')).hide();
            this.reset(); document.getElementById('sec-promo-tamanio').style.display = 'none';
            var msgAccion = esEdicion ? 'Promoción actualizada.' : 'Promoción creada para ' + totalProductos + ' producto(s).';
            notif(msgAccion, 'success');
        } catch (err) { notif('Error al guardar.', 'error'); }
        finally { btn.innerHTML='Guardar'; btn.disabled=false; }
    });
    document.getElementById('modalPromocion')?.addEventListener('hidden.bs.modal', function () {
        _productosPromo = []; renderListaProductosPromo();
        document.getElementById('formularioPromocion').reset();
        document.getElementById('sec-promo-tamanio').style.display = 'none';
    });
}
