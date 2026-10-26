---
name: M&M Academia Platform
description: Sistema visual existente de administración, recepción y asistencia por QR.
colors:
  primary: "#5b21b6"
  primary-strong: "#43158f"
  background: "#f7f5fb"
  surface: "#ffffff"
  text: "#211a2b"
  muted: "#756b80"
  border: "#e8e1ef"
  admin-background: "#f6f3f8"
  sidebar: "#211529"
  field-border: "#cfc2dc"
  focus: "#7c3aed"
  badge-background: "#f2eafa"
  badge-text: "#582888"
  success-background: "#edf8f0"
  success-text: "#22563b"
  error-background: "#fff0f3"
  error-text: "#9b2039"
typography:
  body:
    fontFamily: 'Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif'
  headline:
    fontSize: "clamp(28px, 4vw, 40px)"
    lineHeight: 1
    letterSpacing: "-.045em"
  section-title:
    fontSize: "20px"
    letterSpacing: "-.02em"
  label:
    fontSize: "14px"
  action:
    fontWeight: 650
  kiosk-headline:
    fontSize: "clamp(32px, 5vw, 52px)"
    lineHeight: 1.1
    letterSpacing: "-.035em"
  kiosk-body:
    fontSize: "clamp(17px, 2vw, 21px)"
    lineHeight: 1.6
rounded:
  badge: "7px"
  control: "10px"
  navigation: "11px"
  kiosk-control: "14px"
  surface: "16px"
  kiosk-surface: "24px"
spacing:
  compact: "8px"
  action-gap: "12px"
  form-gap: "16px"
  mobile-surface: "18px"
  surface: "24px"
components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.surface}"
    rounded: "{rounded.control}"
    padding: "10px 17px"
    typography: "{typography.action}"
  button-primary-hover:
    backgroundColor: "{colors.primary-strong}"
  button-secondary:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.primary}"
    rounded: "{rounded.control}"
    padding: "10px 17px"
  input:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text}"
    rounded: "{rounded.control}"
    padding: "11px 13px"
  surface:
    backgroundColor: "{colors.surface}"
    rounded: "{rounded.surface}"
    padding: "{spacing.surface}"
  badge:
    backgroundColor: "{colors.badge-background}"
    textColor: "{colors.badge-text}"
    rounded: "{rounded.badge}"
    padding: "6px 10px"
  kiosk-button:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.surface}"
    rounded: "{rounded.kiosk-control}"
    padding: "16px 26px"
---

# Design System: M&M Academia Platform

## Registro de asistencia — aplicación centrada (25/10/2026)

Esta sección reemplaza las dimensiones y composición anteriores del registro público descritas más abajo, sin cambiar el sistema administrativo. La pantalla `/asistencia` es una aplicación de una sola vista, con marco oscuro `#141019`, borde violeta, superficie clara `#f7f5fb`, acción `#5b21b6` y acento lavanda `#b392ff`. Archivo se usa para títulos, controles y texto, con una escala de aplicación. Se conserva la identidad de M&M en logo, colores y contorno.

Por pedido explícito del usuario, no hay fotografía, bloque promocional ni pantalla dividida similar al login. La cabecera y el pie forman el marco; el área de operación se centra horizontal y verticalmente en el espacio entre ambos. Las acciones QR y DNI son el centro de la interfaz, con icono, verbo e indicación breve. El conjunto tiene un máximo de 640px y el contenido general 760px.

En tablet/escritorio, QR y DNI aparecen lado a lado, centrados, con controles de 190px de alto. Hasta 600px se apilan, conservando su centrado y 104px de alto. Los demás controles conservan 60px y la ayuda 48px. El contorno exterior reduce sus márgenes y radios al pasar a celular. Formularios, cámara, selección y resultados comparten la misma composición central. La página admite desplazamiento vertical en pantallas pequeñas sin recortar campos ni botones. No hay altura fija ni bloqueo de zoom.

Se conservan todos los estados de acceso, sonidos, resultados semánticos y reinicio de privacidad. La ayuda no interrumpe una solicitud en curso. El foco de teclado y las etiquetas QR/DNI siguen siendo explícitos. Sólo hay transiciones breves de interacción, deshabilitadas con preferencia de movimiento reducido; no se agregan secuencias de entrada ni movimiento continuo. Los estilos se limitan al módulo de asistencia y no alteran landing, administración o CSS del login.

## Overview

Este documento registra el sistema implementado de administración, contactos, recepción, recordatorios y kiosco de asistencia. Es una extensión del producto existente: `PRODUCT.md`, `src/app/globals.css` y los estilos administrativos conservan su autoridad. No establece una identidad nueva ni reemplaza los sistemas específicos del portal de profesores o del sitio público comercial.

La administración combina superficies claras, acentos violetas, tipografía sans y navegación lateral oscura. Contactos, recepción y recordatorios comparten formularios y listas de lectura directa. El kiosco público conserva la identidad de la academia con una composición centrada y controles de mayor tamaño para confirmar una asistencia.

**Key Characteristics:**

- Superficies claras con bordes suaves y acciones violetas.
- Navegación administrativa lateral y contenido operativo adaptable.
- Etiquetas y estados en español, con texto además del color.
- Kiosco centrado, táctil y con información personal temporal.

## Colors

### Primary

El violeta primario identifica las acciones principales, vínculos y selección. Su variante intensa aparece al pasar el puntero por los botones de los flujos nuevos. El contorno violeta de foco se distingue del borde de campo.

### Neutral

El fondo general y el fondo administrativo son variantes claras existentes; las superficies de formularios e historial son blancas. La barra lateral usa el tono oscuro registrado en `sidebar`. Los bordes separan paneles y filas sin competir con el contenido. El texto secundario se usa para fechas, instrucciones y metadatos.

Los mensajes de éxito y error combinan fondos suaves y texto contrastado. Los estados públicos también usan iconos y títulos explícitos; una advertencia no debe confundirse con una asistencia fallida.

## Typography

La familia de cuerpo definida en el frontmatter se hereda en botones, enlaces y campos. No se incorpora una segunda familia para los flujos de recepción.

La jerarquía administrativa combina títulos de página fluidos, títulos de sección y etiquetas de formulario. Los títulos del kiosco y sus instrucciones crecen con el ancho disponible. Las tablas de recepción usan números tabulares y texto de cuerpo de 14px; los metadatos se separan en una segunda línea. Mantener las etiquetas de controles en español y orientadas a la acción, como “Guardar configuración”, “Generar QR” y “Volver al inicio”.

## Layout

La administración mantiene su barra lateral fija de 224px y el contenido desplazado a su derecha. A 900px o menos la navegación se convierte en panel lateral desplegable y el contenido pierde ese desplazamiento.

Los flujos de contactos y recordatorios utilizan superficies con el espaciado registrado, acciones que permiten salto de línea y formularios de dos columnas `minmax(0, 1fr)`. El detalle de persona tiene dos columnas con proporción 1.2:1; se apila a 900px. A 550px los formularios pasan a una columna y las superficies usan el espaciado móvil. Los datos largos pueden partirse. Las tablas de recepción tienen desplazamiento horizontal dentro de su contenedor; no deben ensanchar la página.

El kiosco ocupa al menos el alto dinámico de la pantalla. Su cabecera tiene un máximo de 1040px y el contenido principal de 800px. La cámara es cuadrada, con un máximo de 440px; las opciones de clase tienen un máximo de 580px. A 560px, las acciones ocupan el ancho disponible y las opciones apilan nombre y horario.

## Elevation & Depth

Los paneles nuevos de contactos y recepción son planos y se distinguen mediante fondo blanco y borde. El marco administrativo existente conserva sombras suaves en tarjetas y botones, una sombra lateral en la navegación y un fondo translúcido con desenfoque en la barra superior. Los diálogos existentes usan oscurecimiento y desenfoque del fondo. No extender estos efectos al kiosco: su cámara y resultado se distinguen por borde y color de superficie. Los valores exactos de elevación y transición están en el sidecar.

## Shapes

Los controles de contactos usan esquinas curvas moderadas y los paneles un radio mayor, según el frontmatter. Las etiquetas de estado son rectángulos pequeños redondeados. El kiosco amplía los radios de controles, cámara y resultado junto con sus áreas táctiles. No sustituir las variantes existentes del marco administrativo: sus botones y paneles tienen radios propios.

## Components

### Buttons

Los botones primarios de contactos, recepción y recordatorios tienen altura mínima de 46px; los secundarios mantienen la misma geometría con fondo blanco y texto violeta. El foco visible tiene un contorno de 3px separado 3px del borde. Durante una operación se deshabilitan los controles correspondientes, con opacidad reducida y cursor de espera. El marco administrativo conserva sus botones anteriores de 43px y 40px.

Los controles principales y secundarios del kiosco tienen altura mínima de 60px y texto de 17px. Su foco se separa 4px del borde. El tamaño táctil del kiosco no se reduce al reutilizar una acción administrativa.

### Inputs / Fields

Los campos nuevos tienen altura mínima de 48px, borde visible, etiqueta superior y ancho flexible sin mínimo intrínseco que provoque desborde. Las áreas de texto crecen verticalmente. El campo de activación del kiosco tiene altura mínima de 60px. Las preferencias binarias conservan etiquetas completas y casillas nativas.

### Cards / Containers

Los paneles agrupan una tarea concreta mediante título de sección y contenido. Las listas de historial usan divisores y metadatos bajo el texto principal. Los estados vacíos explican la ausencia de registros. Las tablas de recepción mantienen persona, clase, asistencia y cuenta corriente en columnas identificadas.

### Chips

Las etiquetas compactas de contactos distinguen el estado con texto sobre fondo violeta suave. Los estados de otras áreas mantienen sus variantes de color existentes; no utilizar el color como única explicación.

### Navigation

La navegación administrativa mantiene iconos, etiquetas en español y selección violeta sobre fondo oscuro. La selección existente usa un degradado y sombra; el hover aclara la fila. Los interruptores “Llegadas del día” y “Dispositivos” utilizan botones primarios/secundarios y `aria-pressed` para expresar la vista activa.

### QR y resultado de asistencia

La credencial personal se presenta como tarjeta vertical de M&M: cabecera violeta, condición destacada **Aspirante/Alumno**, nombre, DNI, teléfono y QR central sobre blanco. La misma composición se descarga en PNG y se aísla al imprimir; el QR mantiene tamaño y margen para lectura. Si el QR anterior ya fue entregado, la ficha muestra los datos y la condición actuales, pero no puede reconstruir el secreto original: para emitir otra tarjeta se renueva con confirmación y se entrega el nuevo QR. La conversión conserva la identidad y el QR anterior hasta esa renovación.

El kiosco presenta primero cámara y ayuda; cuando hay varias sesiones, pide elegir una sola. El resultado muestra un icono, título, mensaje y sesión. Sólo utiliza el nombre de pila y un aviso financiero general, sin importes ni detalle de deuda. El foco pasa al título del resultado y los estados se anuncian con `status` o `alert`.

**The Confirmation Rule.** La confirmación visible y el sonido de asistencia se producen después de recibir el resultado de la operación. Una conexión incierta muestra ayuda de recepción, sin afirmar que la asistencia quedó registrada.

**The Public Reset Rule.** El resultado se limpia a los 7 segundos y la selección de sesión a los 20 segundos; ocultar la pestaña limpia datos personales y detiene la cámara y el audio. El inicio y la ayuda siguen disponibles sin exponer la cuenta corriente.

Los dispositivos muestran estado y vencimiento de autorización. El código de activación se presenta como temporal y de un solo uso, con acciones para copiarlo u ocultarlo.

## Do's and Don'ts

### Do:

- **Do** conservar la paleta, la tipografía heredada y la navegación administrativa existentes.
- **Do** apilar formularios y acciones en los puntos de adaptación implementados, manteniendo el desplazamiento de tablas dentro de su contenedor.
- **Do** mantener controles táctiles de al menos 60px en el kiosco y etiquetas accesibles en español.
- **Do** acompañar cada estado con texto y confirmar la operación antes de mostrar éxito o reproducir su sonido.
- **Do** limitar el resultado público al nombre de pila, la sesión y avisos generales temporales.

### Don't:

- **Don't** mostrar importes ni desgloses de deuda en el kiosco público.
- **Don't** conservar el resultado o las opciones de una persona después del reinicio de privacidad.
- **Don't** presentar un envío o una asistencia como confirmados cuando la conexión no permite verificar el resultado.
- **Don't** convertir los estilos particulares del kiosco o de los flujos nuevos en un reemplazo global del marco administrativo existente.
