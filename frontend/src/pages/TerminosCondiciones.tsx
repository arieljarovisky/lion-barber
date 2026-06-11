import React from 'react';
import { Link } from 'react-router-dom';
import { ChevronLeft, FileText } from 'lucide-react';
import { LION_LOGO_URL } from '../constants/brandLogo';
import { SHOP_ADDRESS } from '../constants/shopLocation';
import { DEPOSIT_PERCENT } from '../constants/deposit';
import { DEPOSIT_PAYMENT_MINUTES } from '../constants/depositPayment';
import { BOOKING_FALLBACK_WHATSAPP_URL } from '../utils/backendHealth';

const LAST_UPDATED = '8 de junio de 2026';

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-8 sm:mb-10">
      <h2 className="mb-3 font-serif text-lg font-black uppercase tracking-wide text-white sm:text-xl">{title}</h2>
      <div className="space-y-3 text-sm leading-relaxed text-zinc-400 sm:text-[15px]">{children}</div>
    </section>
  );
}

export default function TerminosCondiciones() {
  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-50 font-sans">
      <nav className="fixed top-0 left-0 right-0 z-50 border-b border-zinc-800/50 bg-zinc-950/90 backdrop-blur-md">
        <div className="mx-auto flex h-14 max-w-3xl items-center justify-between gap-3 px-4 sm:h-16">
          <Link
            to="/"
            className="flex items-center gap-1.5 text-zinc-400 transition-colors hover:text-[#e5c185]"
          >
            <ChevronLeft size={20} />
            <span className="text-sm font-medium">Volver</span>
          </Link>
          <img src={LION_LOGO_URL} alt="Lion Barber" className="h-8 w-auto object-contain sm:h-9" />
        </div>
      </nav>

      <main className="mx-auto max-w-3xl px-4 pb-16 pt-20 sm:px-6 sm:pt-24">
        <div className="mb-8 flex items-start gap-3 sm:mb-10">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#e5c185]/15 text-[#e5c185]">
            <FileText size={22} />
          </div>
          <div>
            <h1 className="font-serif text-2xl font-black uppercase tracking-tight text-white sm:text-3xl">
              Términos y condiciones
            </h1>
            <p className="mt-1 text-xs text-zinc-500 sm:text-sm">Última actualización: {LAST_UPDATED}</p>
          </div>
        </div>

        <p className="mb-8 text-sm leading-relaxed text-zinc-300 sm:text-base">
          Estos términos regulan el uso del sitio web y los servicios online de{' '}
          <strong className="text-white">Lion Barber</strong> (reserva de turnos, pagos de seña, abonos y gestión de
          cuenta). Al usar el sitio, crear una cuenta o confirmar una reserva, aceptás estas condiciones.
        </p>

        <Section title="1. Prestador del servicio">
          <p>
            El servicio es ofrecido por <strong className="text-zinc-200">Lion Barber</strong>, barbería ubicada en{' '}
            {SHOP_ADDRESS}, Ciudad Autónoma de Buenos Aires, Argentina. El sitio web es una herramienta para consultar
            servicios, reservar turnos y, cuando corresponda, abonar señas o abonos online.
          </p>
        </Section>

        <Section title="2. Uso del sitio y cuenta">
          <ul className="list-disc space-y-2 pl-5">
            <li>Debés ser mayor de 18 años o contar con autorización de un adulto responsable.</li>
            <li>
              Para reservar con cuenta personal podés iniciar sesión con Google. Sos responsable de la veracidad de los
              datos que proporcionás (nombre, teléfono, email).
            </li>
            <li>
              No está permitido usar el sitio con fines fraudulentos, para bloquear horarios sin intención de asistir o
              para interferir con el funcionamiento del sistema.
            </li>
            <li>
              Podemos suspender o cancelar cuentas que incumplan estas condiciones o abusen del servicio de reservas.
            </li>
          </ul>
        </Section>

        <Section title="3. Reserva de turnos">
          <ul className="list-disc space-y-2 pl-5">
            <li>
              La reserva online está sujeta a disponibilidad de barberos, horarios del local y servicios activos en el
              catálogo.
            </li>
            <li>
              Al elegir servicio, barbero, fecha y hora, el sistema puede reservar provisionalmente el turno hasta que
              se confirme según las reglas de seña o abono que correspondan.
            </li>
            <li>
              Los precios publicados en el sitio son referenciales del catálogo vigente. El importe final puede incluir
              productos adicionales acordados en el local.
            </li>
            <li>
              Hay <strong className="text-zinc-300">10 minutos de tolerancia</strong> desde la hora del turno. Pasado
              ese tiempo, el local puede reprogramar o cancelar la atención según disponibilidad.
            </li>
          </ul>
        </Section>

        <Section title="4. Seña online">
          <ul className="list-disc space-y-2 pl-5">
            <li>
              Salvo que tengas un abono activo con cortes disponibles o una exención otorgada por el local, la reserva
              online requiere el pago de una <strong className="text-zinc-300">seña del {DEPOSIT_PERCENT}%</strong> del
              precio del servicio seleccionado.
            </li>
            <li>
              La seña se procesa a través de <strong className="text-zinc-300">Mercado Pago</strong>. Lion Barber no
              almacena datos completos de tarjetas.
            </li>
            <li>
              Tenés <strong className="text-zinc-300">{DEPOSIT_PAYMENT_MINUTES} minutos</strong> desde la reserva para
              que el pago se apruebe. Si no se acredita en ese plazo, el turno se libera automáticamente.
            </li>
            <li>
              Podés reintentar el pago desde tu perfil mientras no haya vencido ese plazo, sujeto a que el horario siga
              disponible.
            </li>
          </ul>
        </Section>

        <Section title="5. Cancelaciones y reembolsos">
          <ul className="list-disc space-y-2 pl-5">
            <li>Podés cancelar un turno desde tu perfil mientras el turno no haya comenzado.</li>
            <li>
              Si cancelás con al menos <strong className="text-zinc-300">2 horas de anticipación</strong> respecto del
              horario del turno y abonaste seña online, el reembolso se gestiona por Mercado Pago (el acreditado depende
              del banco o medio de pago).
            </li>
            <li>
              Si cancelás con <strong className="text-zinc-300">menos de 2 horas</strong> de anticipación, la seña no
              se reembolsa salvo decisión excepcional del local.
            </li>
            <li>
              Si no te presentás al turno sin cancelar, la seña abonada no genera derecho a reembolso ni reprogramación
              automática.
            </li>
          </ul>
        </Section>

        <Section title="6. Reprogramación">
          <ul className="list-disc space-y-2 pl-5">
            <li>
              Podés reprogramar desde tu perfil si la opción está habilitada para ese turno y respetás la anticipación
              mínima configurada por el local (visible al reservar y en tu cuenta).
            </li>
            <li>
              La reprogramación está sujeta a disponibilidad del barbero y del horario elegido.
            </li>
            <li>
              Si no podés reprogramar online por haber superado el plazo permitido, contactá al local por WhatsApp.
            </li>
          </ul>
        </Section>

        <Section title="7. Abonos">
          <ul className="list-disc space-y-2 pl-5">
            <li>
              Los abonos publicados en el sitio incluyen una cantidad de cortes y condiciones específicas de cada plan
              (precio, vigencia en días si aplica, etc.).
            </li>
            <li>
              Con abono activo y cortes disponibles podés reservar online <strong className="text-zinc-300">sin pagar
              seña</strong>.
            </li>
            <li>
              El abono finaliza al usar todos los cortes incluidos o al vencer la fecha límite del plan, si el plan tiene
              vigencia configurada — lo que ocurra primero.
            </li>
            <li>
              Los cortes se descuentan cuando el local registra el cobro con método «Abono» al atenderte; la reserva
              online no consume el corte por sí sola.
            </li>
            <li>
              Los abonos comprados online se activan tras la acreditación del pago en Mercado Pago. No son reembolsables
              una vez activados y utilizados, salvo lo que indique la normativa de defensa del consumidor aplicable.
            </li>
          </ul>
        </Section>

        <Section title="8. Programa de puntos">
          <p>
            El local puede ofrecer un programa de puntos por visitas. Las reglas de acumulación, canje y vencimiento se
            informan en el sitio o en el local y pueden modificarse con aviso razonable. Los puntos no tienen valor
            monetario fuera del programa definido por Lion Barber.
          </p>
        </Section>

        <Section title="9. Disponibilidad y modificaciones">
          <p>
            El sitio puede experimentar interrupciones por mantenimiento, fallas técnicas o causas ajenas a nuestro
            control. Podemos modificar horarios, servicios, precios, barberos disponibles o funcionalidades del sitio sin
            previo aviso, procurando no afectar turnos ya confirmados.
          </p>
        </Section>

        <Section title="10. Limitación de responsabilidad">
          <p>
            Lion Barber no garantiza que el sitio funcione sin errores en todo momento. No somos responsables por daños
            indirectos derivados del uso del sitio, demoras en pagos de terceros (Mercado Pago, Google) o
            imposibilidad de conexión. Nuestra responsabilidad frente al cliente se limita a la prestación del servicio
            de barbería contratado en el local conforme a la normativa de defensa del consumidor.
          </p>
        </Section>

        <Section title="11. Propiedad intelectual">
          <p>
            El contenido del sitio (textos, imágenes, logo, diseño) pertenece a Lion Barber o se usa con licencia. No
            podés copiarlo, reproducirlo ni explotarlo comercialmente sin autorización previa.
          </p>
        </Section>

        <Section title="12. Privacidad">
          <p>
            El tratamiento de datos personales se rige por nuestra{' '}
            <Link to="/privacidad" className="text-[#e5c185] underline-offset-2 hover:underline">
              Política de privacidad
            </Link>
            , que forma parte de estos términos.
          </p>
        </Section>

        <Section title="13. Ley aplicable y jurisdicción">
          <p>
            Estos términos se rigen por las leyes de la República Argentina. Ante controversias, las partes se someten a
            la jurisdicción de los tribunales competentes de la Ciudad Autónoma de Buenos Aires, sin perjuicio de los
            derechos irrenunciables del consumidor según la Ley 24.240.
          </p>
        </Section>

        <Section title="14. Cambios">
          <p>
            Podemos actualizar estos términos. La versión vigente estará publicada en esta página con la fecha de última
            actualización. El uso continuado del sitio después de un cambio implica aceptación de los nuevos términos.
          </p>
        </Section>

        <Section title="15. Contacto">
          <p>
            Consultas sobre reservas, pagos o estos términos:{' '}
            <a
              href={BOOKING_FALLBACK_WHATSAPP_URL}
              target="_blank"
              rel="noreferrer"
              className="text-[#e5c185] underline-offset-2 hover:underline"
            >
              WhatsApp
            </a>{' '}
            o presencialmente en {SHOP_ADDRESS}.
          </p>
        </Section>

        <div className="mt-10 flex flex-wrap gap-4 border-t border-zinc-800 pt-6">
          <Link
            to="/"
            className="inline-flex items-center gap-1.5 text-sm font-medium text-zinc-400 transition-colors hover:text-[#e5c185]"
          >
            <ChevronLeft size={18} />
            Volver al inicio
          </Link>
          <Link
            to="/privacidad"
            className="text-sm font-medium text-zinc-500 underline-offset-2 transition-colors hover:text-[#e5c185] hover:underline"
          >
            Política de privacidad
          </Link>
        </div>
      </main>
    </div>
  );
}
