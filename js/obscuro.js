// obscuro.js — Sistema de tema claro/oscuro sin parpadeo
// La clase 'modo-oscuro' se aplica en el <head> de cada página
// para evitar el flash; este archivo gestiona los botones y la lógica posterior al DOM.

(function () {
    // Aplicar tema inmediatamente si el body ya existe (por si se carga tarde)
    var tema = localStorage.getItem('temaPizzeria') || 'claro';
    var html = document.documentElement;
    if (tema === 'oscuro') html.classList.add('modo-oscuro');
    else                   html.classList.remove('modo-oscuro');
})();

document.addEventListener('DOMContentLoaded', function () {

    // Activar transiciones suaves sólo después de la carga inicial
    // (evita el flash de colores al entrar a la página)
    setTimeout(function () { document.body.classList.add('tema-listo'); }, 100);

    var sistemaTema = {

        obtener: function () {
            return localStorage.getItem('temaPizzeria') || 'claro';
        },

        aplicar: function (tema) {
            var html = document.documentElement;

            if (tema === 'oscuro') {
                html.classList.add('modo-oscuro');
                localStorage.setItem('temaPizzeria', 'oscuro');
                // Actualizar ícono e texto del botón en el offcanvas
                document.querySelectorAll('[data-btn-tema]').forEach(function (btn) {
                    btn.innerHTML = '<i class="bi bi-sun-fill icono-menu"></i> Tema Claro';
                });
                // Actualizar botón en la navbar desktop
                document.querySelectorAll('#btn-tema').forEach(function (btn) {
                    btn.innerHTML = '<i class="bi bi-sun-fill"></i> Claro';
                });
            } else {
                html.classList.remove('modo-oscuro');
                localStorage.setItem('temaPizzeria', 'claro');
                document.querySelectorAll('[data-btn-tema]').forEach(function (btn) {
                    btn.innerHTML = '<i class="bi bi-moon-stars-fill icono-menu"></i> Tema Oscuro';
                });
                document.querySelectorAll('#btn-tema').forEach(function (btn) {
                    btn.innerHTML = '<i class="bi bi-moon-stars-fill"></i> Oscuro';
                });
            }
        },

        alternar: function () {
            this.aplicar(this.obtener() === 'oscuro' ? 'claro' : 'oscuro');
        }
    };

    // Aplicar estado inicial a los botones
    sistemaTema.aplicar(sistemaTema.obtener());

    // Botón de tema en la navbar desktop
    var btnTema = document.getElementById('btn-tema');
    if (btnTema) {
        btnTema.addEventListener('click', function (e) {
            e.preventDefault();
            e.stopPropagation();
            sistemaTema.alternar();
        });
    }

    // Botones de tema dentro del offcanvas (data-btn-tema)
    document.querySelectorAll('[data-btn-tema]').forEach(function (btn) {
        btn.addEventListener('click', function (e) {
            e.preventDefault();
            sistemaTema.alternar();
        });
    });

    // Detectar preferencia del sistema operativo si el usuario no ha elegido nada
    if (window.matchMedia && !localStorage.getItem('temaPizzeria')) {
        var darkMQ = window.matchMedia('(prefers-color-scheme: dark)');
        sistemaTema.aplicar(darkMQ.matches ? 'oscuro' : 'claro');
        darkMQ.addEventListener('change', function (e) {
            if (!localStorage.getItem('temaPizzeria')) {
                sistemaTema.aplicar(e.matches ? 'oscuro' : 'claro');
            }
        });
    }

    // Restaurar tema al navegar con el historial del navegador
    window.addEventListener('pageshow', function () {
        sistemaTema.aplicar(sistemaTema.obtener());
    });
});
