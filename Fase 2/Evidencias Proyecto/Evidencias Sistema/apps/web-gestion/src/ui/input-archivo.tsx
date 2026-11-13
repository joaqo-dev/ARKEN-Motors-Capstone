import { ExternalLink, FileText, ImageOff, X } from 'lucide-react';
import { useEffect, useRef, useState, type InputHTMLAttributes, type ReactNode } from 'react';
import { Input, Nota } from './componentes';

// Campo de archivo con vista previa (documentos legales y boletas): muestra el
// archivo elegido antes de guardar. Se usa igual que <Input type="file"> con
// register(); el archivo se sube al enviar el formulario.

const MB = 1024 * 1024;

export function InputArchivo({
  maxMb,
  aviso,
  onChange,
  ref,
  ...props
}: Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> & {
  ref?: React.Ref<HTMLInputElement>;
  maxMb?: number;
  // Qué revisar en el archivo (ej. "que diga que vence el 31-03-2027").
  aviso?: ReactNode;
}) {
  const [archivo, setArchivo] = useState<File | null>(null);
  const propio = useRef<HTMLInputElement | null>(null);

  // Une el ref de register() con el propio (para poder quitar el archivo).
  const unirRef = (el: HTMLInputElement | null) => {
    propio.current = el;
    if (typeof ref === 'function') ref(el);
    else if (ref) (ref as React.RefObject<HTMLInputElement | null>).current = el;
  };

  const quitar = () => {
    const el = propio.current;
    if (!el) return;
    el.value = '';
    setArchivo(null);
    // Avisa al formulario (register) que el campo quedó vacío.
    onChange?.({ target: el, currentTarget: el, type: 'change' } as never);
  };

  return (
    <div className="space-y-2">
      <Input
        {...props}
        ref={unirRef}
        type="file"
        onChange={(e) => {
          setArchivo(e.target.files?.[0] ?? null);
          onChange?.(e);
        }}
      />
      {archivo && <VistaPrevia archivo={archivo} maxMb={maxMb} aviso={aviso} onQuitar={quitar} />}
    </div>
  );
}

const esPdf = (f: File) => f.type === 'application/pdf' || /\.pdf$/i.test(f.name);
const esImagen = (f: File) => f.type.startsWith('image/') || /\.(heic|heif|avif)$/i.test(f.name);

function tamano(bytes: number) {
  return bytes >= MB
    ? `${(bytes / MB).toLocaleString('es-CL', { maximumFractionDigits: 1 })} MB`
    : `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

function VistaPrevia({
  archivo,
  maxMb,
  aviso,
  onQuitar,
}: {
  archivo: File;
  maxMb?: number;
  aviso?: ReactNode;
  onQuitar: () => void;
}) {
  const [url, setUrl] = useState<string | null>(null);
  const [sinVista, setSinVista] = useState(false);

  // URL local del archivo (no sale del navegador); se libera al cambiarlo.
  useEffect(() => {
    const u = URL.createObjectURL(archivo);
    setUrl(u);
    setSinVista(false);
    return () => URL.revokeObjectURL(u);
  }, [archivo]);

  const pesado = maxMb !== undefined && archivo.size > maxMb * MB;
  const pdf = esPdf(archivo);
  const imagen = !pdf && esImagen(archivo);

  return (
    // El campo va dentro de un <label>: un clic en la vista previa no debe volver
    // a abrir el selector de archivos (salvo en sus enlaces y botones).
    <div
      onClick={(e) => {
        if (!(e.target as HTMLElement).closest('a, button')) e.preventDefault();
      }}
      className="overflow-hidden rounded-2xl bg-superficie ring-1 ring-inset ring-slate-200"
    >
      <div className="flex items-center gap-2.5 px-3 py-2.5">
        <FileText className="size-4 shrink-0 text-slate-400" aria-hidden />
        <p className="min-w-0 flex-1 text-sm">
          <span className="block truncate font-medium text-slate-900">{archivo.name}</span>
          <span className="text-xs text-slate-500">
            {pdf ? 'PDF' : imagen ? 'Imagen' : 'Archivo'} · {tamano(archivo.size)}
          </span>
        </p>
        {url && (pdf || (imagen && !sinVista)) && (
          <a
            href={url}
            target="_blank"
            rel="noreferrer"
            data-ayuda="Abre el archivo en otra pestaña para verlo en grande"
            className="inline-flex h-8 items-center gap-1.5 rounded-full px-3 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-100 hover:text-slate-900"
          >
            <ExternalLink className="size-3.5" aria-hidden />
            Ver en grande
          </a>
        )}
        <button
          type="button"
          onClick={onQuitar}
          aria-label="Quitar archivo"
          data-ayuda="Quita este archivo para elegir otro"
          className="inline-flex size-8 items-center justify-center rounded-full text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-900"
        >
          <X className="size-4" aria-hidden />
        </button>
      </div>

      {url && pdf && (
        <iframe
          title={`Vista previa de ${archivo.name}`}
          src={`${url}#toolbar=0&navpanes=0&view=FitH`}
          className="block h-80 w-full border-t border-slate-200 bg-white"
        />
      )}
      {url && imagen && !sinVista && (
        <div className="border-t border-slate-200 bg-slate-50 p-2">
          <img
            src={url}
            alt={`Vista previa de ${archivo.name}`}
            onError={() => setSinVista(true)}
            className="mx-auto max-h-80 w-auto rounded-lg object-contain"
          />
        </div>
      )}
      {(sinVista || (!pdf && !imagen)) && (
        <p className="flex items-center gap-2 border-t border-slate-200 px-3 py-3 text-xs leading-relaxed text-slate-600">
          <ImageOff className="size-4 shrink-0 text-slate-400" aria-hidden />
          Este navegador no puede mostrar este formato (por ejemplo, HEIC de iPhone). Al guardarlo
          se convierte a JPG y podrás verlo desde el sistema.
        </p>
      )}

      {(pesado || aviso) && (
        <div className="space-y-2 border-t border-slate-200 p-3">
          {pesado && (
            <Nota tono="aviso">
              Pesa {tamano(archivo.size)}: el máximo es {maxMb} MB. Elige uno más liviano.
            </Nota>
          )}
          {aviso && <Nota>{aviso}</Nota>}
        </div>
      )}
    </div>
  );
}
