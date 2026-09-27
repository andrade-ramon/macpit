import { Link } from 'react-router';

export const NotFoundPage = () => (
  <div className="space-y-2">
    <h1 className="text-2xl font-semibold">Página não encontrada</h1>
    <Link to="/" className="text-accent hover:underline">
      Voltar para a visão geral
    </Link>
  </div>
);
