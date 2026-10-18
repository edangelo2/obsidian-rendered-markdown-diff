---
title: Reglas contables
module: AE
status: review
tags: [accounting, rules, golden-copy]
---
# Reglas contables

Las **reglas contables** definen qué asiento genera cada evento de negocio que llega al [[AE Inbox|Inbox]]. Cada regla se evalúa en orden de prioridad y la primera que coincide es la que se aplica.

> [!note] Alcance
> Este documento cubre las reglas vigentes en la golden copy del ModelBank, versión 2026.3.

## Conceptos

- **Evento de negocio**: lo que publica el sistema origen.
- **Regla**: condición más plantilla de asiento.
- **Plantilla**: las líneas debe/haber con sus cuentas y la fórmula de cada monto.
- **Traducción**: tabla que mapea códigos del origen a cuentas.
- **Variante**: una plantilla alternativa por entidad legal.

## Evaluación

El motor toma el evento, arma el contexto con los campos publicados y recorre las reglas activas del producto. Si ninguna regla coincide, el evento queda en estado `UNMATCHED` y aparece en el monitor de contabilidad.

La prioridad es un entero; menor número, mayor prioridad. Dos reglas con la misma prioridad se desempatan por fecha de alta.

### Campos del contexto

| Campo | Tipo | Origen |
|---|---|---|
| `eventType` | texto | publicación |
| `amount` | decimal(18,4) | publicación |
| `currency` | ISO 4217 | publicación |
| `valueDate` | fecha | publicación |
| `legalEntity` | texto | enriquecimiento |

## Ejemplo

```sql
SELECT rule_id, priority
FROM ae_rule
WHERE product = 'BOND' AND active = 'Y'
ORDER BY priority, created_at;
```

Un cupón de bono (`COUPONCUT`) genera dos líneas: debe en la cuenta de cupones a cobrar y haber en intereses devengados.

> [!warning] Moneda extranjera
> Si el cupón está en otra moneda, la plantilla agrega una tercera línea por diferencia de cambio.

## Errores frecuentes

1. Regla sin plantilla asociada.
2. Traducción faltante para la moneda o la entidad legal.
3. Cuenta dada de baja en el plan de cuentas.

Las reglas inactivas no se evalúan, pero se conservan para auditoría.

## Historial

Esta sección se mantiene a mano y lista los cambios relevantes de cada versión del motor.

- 2025: primera versión del motor.
- 2026: se agregan las tablas de traducción.

Ver también [[Plan de cuentas]], [[Tablas de traducción]] y [[Monitor contable]].
