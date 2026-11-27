# Verificação do rastreamento — 27/11/2026

- Objetivo: atribuir jornada LP → clique WhatsApp → checkout → PIX → pagamento.
- Lead é o proxy previamente escolhido para clique no botão WhatsApp; não comprova envio de mensagem, conversa iniciada nem teste gratuito.
- Identificador instalado mantido; nenhuma campanha ou configuração de otimização da Meta foi alterada.
- Sem aviso automático, conforme escolha do usuário. Recusas, GPC e regiões obrigatórias/desconhecidas bloqueiam publicidade. Preferências disponíveis na LP e pagamento.
- Visitas e cliques da LP são transacionais e idempotentes; fbc/fbclid preservados integralmente, ID de Lead estável e recebimento validado por events_received.
- 139 testes aprovados; build OK. Jornada autenticada no funil mostrou Landing page → Clique no WhatsApp → Meta: Lead recebido.
- Registros próprios de teste: N3NZMK e HJD3DD foram enviados à Meta como testes de verificação usando a LP existente. Não são clientes nem vendas. HJD3DD teve exatamente uma visita e um clique após repetição de entrega.
- Recusa testada: Pixel não carregou. Aceitação explícita permitiu envio. Tela móvel sem overflow; formulário de pagamento abriu sem emitir PIX nem renovar acesso.
- Não verificado: compra/ativação real, coluna atribuída da campanha na Meta, publicação da nova versão. Recebimento não prova atribuição ou elegibilidade para otimização.
- Pendente: identificar campanha interna para associar trafegofb; não adivinhar associação de campanha.
- Não reconstruir eventos históricos desconhecidos nem reenviar leads de visitantes como testes.
- Manter evidências de permissão, verificar restrições do conjunto de dados no Gerenciador de Eventos, aceitar Business Tools Terms e permitir retirada da autorização.
