---
title: Reglas contables
module: AE
status: draft
tags: [accounting, rules]
---
# Reglas contables

Las **reglas contables** definen qué asiento genera cada evento de negocio que llega al [[AE Inbox|Inbox]]. Cada regla se evalúa en orden de prioridad y la primera que coincide gana.

> [!note] Alcance
> Este documento cubre las reglas vigentes en la golden copy del ModelBank.

## Conceptos

- **Evento de negocio**: lo que publica el sistema origen.
- **Regla**: condición más plantilla de asiento.
- **Plantilla**: las líneas debe/haber con sus cuentas.
- **Traducción**: tabla que mapea códigos del origen a cuentas.

## Evaluación

El motor toma el evento, arma el contexto con los campos publicados y recorre las reglas activas del producto. Si ninguna regla coincide, el evento queda en estado `PENDING` hasta que alguien lo revise a mano.

La prioridad es un entero; menor número, mayor prioridad. Dos reglas con la misma prioridad se desempatan por fecha de alta.

### Campos del contexto

| Campo | Tipo | Origen |
|---|---|---|
| `eventType` | texto | publicación |
| `amount` | decimal | publicación |
| `currency` | ISO 4217 | publicación |
| `valueDate` | fecha | publicación |

## Ejemplo

```sql
SELECT rule_id, priority
FROM ae_rule
WHERE product = 'BOND' AND active = 'Y'
ORDER BY priority;
```

Un cupón de bono (`COUPONCUT`) genera dos líneas: debe en la cuenta de cupones a cobrar y haber en intereses devengados.

## Errores frecuentes

1. Regla sin plantilla asociada.
2. Traducción faltante para la moneda.
3. Cuenta dada de baja en el plan de cuentas.

Las reglas inactivas no se evalúan, pero se conservan para auditoría.

## Historial

Esta sección se mantiene a mano y lista los cambios relevantes de cada versión del motor.

- 2025: primera versión del motor.
- 2026: se agregan las tablas de traducción.

## Pendientes

Revisar con contabilidad el tratamiento de los cupones en moneda extranjera.

Ver también [[Plan de cuentas]] y [[Tablas de traducción]].
