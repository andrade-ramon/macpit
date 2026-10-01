# ADR 0006 — Limpeza assistida com prévia e Lixeira

Status: aceito.

## Contexto

O explorador de disco mede uso, mas tamanho não determina se um arquivo pode ser removido. Limpeza precisa de revisão humana, uma seleção vinculada à prévia e recuperação após falhas.

## Decisão

Regras locais fechadas reconhecem caches de desenvolvimento e Downloads sujeitos a revisão manual. Análise não altera arquivos, nem usa IA. Prévia em memória dura 10 minutos e é consumida antes de executar. O cliente confirma IDs; o servidor conserva snapshots e revalida identidade, metadados, ancestrais e uso.

Cada arquivo é isolado por rename numa área privada no mesmo diretório, revalidado e enviado à Lixeira pelo Finder com AppleScript fixo e argv. Isso usa APIs de arquivos e `execFile`, sem introduzir um executor por shell ou passar pelo RunManager. A restauração não sobrescreve novos arquivos. Não há exclusão permanente ou esvaziamento da Lixeira.

## Consequências

O Finder pode exigir autorização de Automação. A recuperação é manual para o caminho original; “Colocar de Volta” pode apontar para a área temporária. Queda ou falha de restauração pode deixar `.macpit-cleanup-*` com um manifesto. Operações nativas que terminam sem resposta podem ter resultado incerto, e não são repetidas automaticamente. Área privada e revalidação reduzem corridas, mas não protegem contra processos maliciosos do mesmo usuário/root nem garantem que um arquivo permaneça fechado após `lsof`. Bytes lógicos e envio à Lixeira não representam espaço efetivamente liberado no APFS.
