import { describe, expect, it } from 'vitest';
import { parseAuthResults, parseReceivedChain } from '../../src/main/headers-analysis';

const HEADERS = [
  'Received: from mx2.example.net (mx2.example.net [203.0.113.9])',
  '\tby destino.example.com with ESMTPS;',
  '\tFri, 24 Apr 2026 13:40:30 +0000',
  'Received: from origen.example.org (origen.example.org [198.51.100.7])',
  '\tby mx2.example.net with ESMTP;',
  '\tFri, 24 Apr 2026 13:40:10 +0000',
  'Authentication-Results: mx2.example.net; spf=pass smtp.mailfrom=example.org;',
  '\tdkim=pass header.d=example.org; dmarc=fail action=quarantine',
  'Received-SPF: Pass (sender SPF authorized)',
  'Subject: prueba'
].join('\r\n');

describe('parseReceivedChain', () => {
  it('ordena cronológicamente y calcula la demora entre saltos', () => {
    const hops = parseReceivedChain(HEADERS);
    expect(hops).toHaveLength(2);
    // El origen primero (el Received más antiguo está al final de la cabecera).
    expect(hops[0]?.from).toContain('origen.example.org');
    expect(hops[0]?.by).toBe('mx2.example.net');
    expect(hops[1]?.by).toBe('destino.example.com');
    expect(hops[1]?.deltaSeconds).toBe(20);
  });

  it('sin cabeceras Received devuelve vacío', () => {
    expect(parseReceivedChain('Subject: x\r\nFrom: a@b.c')).toHaveLength(0);
  });

  it('extrae la IP declarada en cada salto', () => {
    const hops = parseReceivedChain(HEADERS);
    expect(hops[0]?.ip).toBe('198.51.100.7');
    expect(hops[1]?.ip).toBe('203.0.113.9');
  });

  const ipOf = (received: string) => parseReceivedChain(`Received: ${received}`)[0]?.ip;

  it('reconoce las formas habituales del literal IP', () => {
    expect(ipOf('from [203.0.113.5] by mx.example.com;')).toBe('203.0.113.5');
    expect(ipOf('from x ([IPv6:2001:db8::1]) by mx.example.com;')).toBe('2001:db8::1');
    expect(ipOf('from x ([2001:db8::1]) by mx.example.com;')).toBe('2001:db8::1');
    expect(ipOf('from x (x [203.0.113.5]) by mx.example.com;')).toBe('203.0.113.5');
  });

  it('no inventa una IP donde no la hay', () => {
    expect(ipOf('from mail.example.com by mx.example.com;')).toBeUndefined();
    // Un octeto fuera de rango no es una dirección, y quedarse con un trozo
    // ("99.1.1.1") daría un indicador falso que alguien podría llegar a
    // reportar o bloquear.
    expect(ipOf('from host-999.1.1.1.example by mx.example.com;')).toBeUndefined();
  });

  // La cláusula `by` lleva versiones de software e identificadores de cola que
  // se parecen a una IP; atribuirlos al emisor sería un dato inventado.
  it('ignora los números de la cláusula by', () => {
    expect(ipOf('from mail.example.com by mx.example.com (Postfix 10.0.0.1) with ESMTP;')).toBeUndefined();
    expect(ipOf('from mail.example.com (mail [203.0.113.5]) by mx (Postfix 10.0.0.1);')).toBe('203.0.113.5');
  });

  // `[13:40:30]` encaja con la forma de un IPv6 abreviado pero es una hora.
  it('no confunde una hora entre corchetes con un IPv6', () => {
    expect(ipOf('from mail.example.com [13:40:30] by mx.example.com;')).toBeUndefined();
    // Y el prefijo `IPv6:` no la convierte en dirección: lo escribe la misma
    // cabecera que se está analizando, así que no aporta ninguna garantía.
    expect(ipOf('from mail.example.com [IPv6:13:40:30] by mx.example.com;')).toBeUndefined();
  });

  it('acepta las formas válidas de IPv6, incluida la IPv4 embebida', () => {
    expect(ipOf('from x ([IPv6:::ffff:192.0.2.1]) by mx;')).toBe('::ffff:192.0.2.1');
    expect(ipOf('from x ([1:2:3:4:5:6:192.0.2.1]) by mx;')).toBe('1:2:3:4:5:6:192.0.2.1');
    expect(ipOf('from x ([2001:db8::1]) by mx;')).toBe('2001:db8::1');
    expect(ipOf('from x ([::1]) by mx;')).toBe('::1');
    expect(ipOf('from x ([2001:db8:0:0:0:0:0:1]) by mx;')).toBe('2001:db8:0:0:0:0:0:1');
  });

  // Cada caso ataca una regla distinta del validador. Los tres primeros se
  // eligieron por mutación: con entradas más obvias (`1::2::3`, `zzzz`) la
  // regla correspondiente no llegaba a ejercitarse —otra la rechazaba antes—
  // y podía borrarse sin que ningún test se enterara.
  it('rechaza un IPv6 mal formado', () => {
    // Doble compresión que el mero recuento de grupos no descarta.
    expect(ipOf('from x ([1:2:3:4:5:6:7:8::a::b]) by mx;')).toBeUndefined();
    // Grupo de cinco dígitos y punto dentro de un grupo: ambos pasan el filtro
    // de caracteres del candidato, solo los caza la validación por grupo.
    expect(ipOf('from x ([2001:db8:12345::1]) by mx;')).toBeUndefined();
    expect(ipOf('from x ([2001:db.8::1]) by mx;')).toBeUndefined();
    // `::` ha de sustituir al menos a un grupo: con los ocho ya presentes, sobra.
    expect(ipOf('from x ([1:2:3:4:5:6:7:8::]) by mx;')).toBeUndefined();
    expect(ipOf('from x ([1:2:3:4:5:6:7:8:9]) by mx;')).toBeUndefined(); // nueve grupos
    expect(ipOf('from x ([1::2::3]) by mx;')).toBeUndefined();
  });

  // Un nombre de host lo elige quien envía. Si un fragmento suyo pasa por IP,
  // el panel publica una dirección inventada —y para colmo tapa la real, por
  // ser la primera coincidencia— que alguien podría reportar o bloquear.
  it('no extrae una IP de un fragmento del nombre del host', () => {
    expect(ipOf('from mail-1.2.3.4.5.example by mx.example.com;')).toBeUndefined();
    expect(ipOf('from mail-1.2.3.4.5.example ([203.0.113.5]) by mx.example.com;')).toBe(
      '203.0.113.5'
    );
  });

  const hopOf = (received: string) => parseReceivedChain(`Received: ${received}`)[0];

  it('separa el nombre anunciado de lo que va entre paréntesis', () => {
    const hop = hopOf('from mail.example.com (mail.example.com [203.0.113.5]) by mx.example.com;');
    // El paréntesis no debe colarse en el nombre: la interfaz muestra el rDNS
    // y la IP por separado y quedarían repetidos.
    expect(hop?.from).toBe('mail.example.com');
    expect(hop?.ip).toBe('203.0.113.5');
  });

  it('conserva el rDNS solo cuando difiere del nombre anunciado', () => {
    // Discrepa: el emisor dice ser el banco pero su IP resuelve a otro sitio.
    expect(hopOf('from mail.banco.example (vps.hosting.example [203.0.113.5]) by mx;')?.rdns).toBe(
      'vps.hosting.example'
    );
    // Coincide: repetirlo no aporta nada.
    expect(hopOf('from mail.example.com (mail.example.com [203.0.113.5]) by mx;')?.rdns).toBeUndefined();
    // Ni «unknown» ni la propia IP son un nombre inverso.
    expect(hopOf('from mail.example.com (unknown [203.0.113.5]) by mx;')?.rdns).toBeUndefined();
    expect(hopOf('from mail.example.com (203.0.113.5) by mx;')?.rdns).toBeUndefined();
  });

  // `by host; fecha` es la forma habitual y el token se llevaba el separador.
  it('no arrastra el punto y coma que precede a la fecha', () => {
    const hop = hopOf('from origen.example by mx.example.com; Mon, 10 Jun 2024 12:00:00 +0000');
    expect(hop?.by).toBe('mx.example.com');
    expect(hop?.date).toBe('2024-06-10T12:00:00.000Z');
  });

  it('sin nombre anunciado deja el literal IP sin corchetes, comparable con ip', () => {
    const hop = hopOf('from [203.0.113.5] by mx.example.com;');
    expect(hop?.from).toBe('203.0.113.5');
    expect(hop?.from).toBe(hop?.ip); // la interfaz omite el chip duplicado
  });
});

describe('parseAuthResults', () => {
  it('extrae spf/dkim/dmarc con su resultado, sin duplicados', () => {
    const auth = parseAuthResults(HEADERS);
    const byMech = Object.fromEntries(auth.map((a) => [a.mechanism, a.result]));
    expect(byMech['spf']).toBe('pass');
    expect(byMech['dkim']).toBe('pass');
    expect(byMech['dmarc']).toBe('fail');
    expect(auth.filter((a) => a.mechanism === 'spf')).toHaveLength(1);
  });
});
