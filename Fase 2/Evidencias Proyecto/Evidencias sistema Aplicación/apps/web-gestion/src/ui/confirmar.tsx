import { useState } from 'react';
import { Acciones, Boton, Campo, Modal, Textarea } from './componentes';

// Confirmación de una acción, opcionalmente con motivo (obligatorio en anulaciones).
export function Confirmar({
  titulo,
  mensaje,
  textoConfirmar = 'Confirmar',
  peligro,
  pedirMotivo,
  motivoOpcional,
  cargando,
  onConfirmar,
  onCerrar,
}: {
  titulo: string;
  mensaje: React.ReactNode;
  textoConfirmar?: string;
  peligro?: boolean;
  pedirMotivo?: boolean;
  motivoOpcional?: boolean;
  cargando?: boolean;
  onConfirmar: (motivo: string) => void;
  onCerrar: () => void;
}) {
  const [motivo, setMotivo] = useState('');
  const falta = pedirMotivo && !motivoOpcional && motivo.trim() === '';
  return (
    <Modal titulo={titulo} onCerrar={onCerrar} ancho="max-w-md">
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          if (!falta) onConfirmar(motivo.trim());
        }}
      >
        <div className="text-sm leading-relaxed text-slate-600">{mensaje}</div>
        {pedirMotivo && (
          <Campo etiqueta={motivoOpcional ? 'Motivo (opcional)' : 'Motivo'}>
            <Textarea
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              autoFocus
              maxLength={500}
            />
          </Campo>
        )}
        <Acciones>
          <Boton variante="secundario" onClick={onCerrar}>
            Cancelar
          </Boton>
          <Boton
            type="submit"
            variante={peligro ? 'peligro' : 'primario'}
            disabled={falta}
            cargando={cargando}
          >
            {textoConfirmar}
          </Boton>
        </Acciones>
      </form>
    </Modal>
  );
}
