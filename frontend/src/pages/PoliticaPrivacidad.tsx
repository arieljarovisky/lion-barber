import React from 'react';
import { Link } from 'react-router-dom';
import { ChevronLeft, Shield } from 'lucide-react';
import { LION_LOGO_URL } from '../constants/brandLogo';
import { SHOP_ADDRESS } from '../constants/shopLocation';
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

export default function PoliticaPrivacidad() {
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
            <Shield size={22} />
          </div>
          <div>
            <h1 className="font-serif text-2xl font-black uppercase tracking-tight text-white sm:text-3xl">
              Política de privacidad
            </h1>
            <p className="mt-1 text-xs text-zinc-500 sm:text-sm">Última actualización: {LAST_UPDATED}</p>
          </div>
        </div>

        <p className="mb-8 text-sm leading-relaxed text-zinc-300 sm:text-base">
          En <strong className="text-white">Lion Barber</strong> respetamos tu privacidad. Esta política explica qué datos
          recopilamos cuando usás nuestro sitio web, cómo los usamos y cuáles son tus derechos conforme a la legislación
          argentina de protección de datos personales (Ley 25.326 y normativa complementaria).
        </p>

        <Section title="1. Responsable">
          <p>
            El responsable del tratamiento de los datos es <strong className="text-zinc-200">Lion Barber</strong>, con
            domicilio en {SHOP_ADDRESS}, Ciudad Autónoma de Buenos Aires, Argentina.
          </p>
        </Section>

        <Section title="2. Datos que recopilamos">
          <p>Podemos tratar las siguientes categorías de datos, según cómo uses el sitio:</p>
          <ul className="list-disc space-y-2 pl-5">
            <li>
              <strong className="text-zinc-300">Identificación y contacto:</strong> nombre, apellido, correo electrónico
              y teléfono (incluido el vinculado a tu cuenta de Google o el que ingreses al reservar).
            </li>
            <li>
              <strong className="text-zinc-300">Cuenta y autenticación:</strong> identificador de Google al iniciar
              sesión, token de sesión almacenado en tu dispositivo y rol de usuario (cliente o personal del local).
            </li>
            <li>
              <strong className="text-zinc-300">Turnos y servicios:</strong> servicio elegido, barbero, fecha, hora,
              estado del turno, historial de reservas, reprogramaciones y cancelaciones.
            </li>
            <li>
              <strong className="text-zinc-300">Pagos:</strong> información necesaria para procesar señas y abonos a
              través de Mercado Pago (estado del pago, identificadores de transacción y montos). No almacenamos datos
              completos de tarjetas: el cobro lo procesa Mercado Pago según sus propias políticas.
            </li>
            <li>
              <strong className="text-zinc-300">Abonos y programa de puntos:</strong> plan contratado, cortes
              disponibles o usados, puntos acumulados y consumos asociados a tu perfil.
            </li>
            <li>
              <strong className="text-zinc-300">Comunicaciones:</strong> correos transaccionales sobre turnos, pagos,
              abonos y recordatorios, cuando corresponda.
            </li>
            <li>
              <strong className="text-zinc-300">Datos técnicos:</strong> dirección IP, tipo de navegador, dispositivo y
              registros básicos de uso del sitio necesarios para seguridad y funcionamiento.
            </li>
          </ul>
        </Section>

        <Section title="3. Finalidades del tratamiento">
          <p>Utilizamos tus datos para:</p>
          <ul className="list-disc space-y-2 pl-5">
            <li>Gestionar reservas, reprogramaciones, cancelaciones y la agenda del local.</li>
            <li>Procesar señas online, pagos de abonos y confirmar transacciones con Mercado Pago.</li>
            <li>Administrar tu cuenta, abonos, puntos y perfil de cliente.</li>
            <li>Enviarte notificaciones por email relacionadas con tus turnos o tu abono.</li>
            <li>Atender consultas, reclamos o solicitudes vinculadas a la protección de datos.</li>
            <li>Cumplir obligaciones legales, contables o fiscales cuando corresponda.</li>
            <li>Prevenir fraudes, abusos del sistema y garantizar la seguridad del servicio.</li>
          </ul>
        </Section>

        <Section title="4. Base de legitimación">
          <p>
            El tratamiento se basa en la ejecución del servicio que solicitás (reserva de turnos y gestión de tu cuenta),
            tu consentimiento al registrarte o iniciar sesión, el cumplimiento de obligaciones legales y el interés
            legítimo del local en operar de forma segura y eficiente.
          </p>
        </Section>

        <Section title="5. Cesión a terceros">
          <p>Compartimos datos solo cuando es necesario para prestar el servicio:</p>
          <ul className="list-disc space-y-2 pl-5">
            <li>
              <strong className="text-zinc-300">Google:</strong> autenticación con cuenta de Google. Su uso de datos se
              rige por las políticas de Google (
              <a
                href="https://policies.google.com/privacy"
                target="_blank"
                rel="noreferrer"
                className="text-[#e5c185] underline-offset-2 hover:underline"
              >
                Política de privacidad de Google
              </a>
              ).
            </li>
            <li>
              <strong className="text-zinc-300">Mercado Pago:</strong> procesamiento de pagos de señas y abonos. Consultá
              su política en{' '}
              <a
                href="https://www.mercadopago.com.ar/privacidad"
                target="_blank"
                rel="noreferrer"
                className="text-[#e5c185] underline-offset-2 hover:underline"
              >
                mercadopago.com.ar/privacidad
              </a>
              .
            </li>
            <li>
              <strong className="text-zinc-300">Proveedores de infraestructura:</strong> hosting, base de datos, envío de
              emails o mensajería, bajo contratos que exigen confidencialidad y seguridad adecuadas.
            </li>
          </ul>
          <p>No vendemos ni alquilamos tus datos personales a terceros con fines comerciales.</p>
        </Section>

        <Section title="6. Plazo de conservación">
          <p>
            Conservamos los datos mientras mantengas una cuenta activa, mientras exista una relación comercial razonable
            o el tiempo necesario para cumplir obligaciones legales, resolver disputas o hacer valer nuestros derechos.
            Los datos de turnos y pagos pueden conservarse por plazos contables o fiscales exigidos por la normativa
            vigente.
          </p>
        </Section>

        <Section title="7. Tus derechos">
          <p>Como titular de los datos podés solicitar, conforme a la Ley 25.326:</p>
          <ul className="list-disc space-y-2 pl-5">
            <li>Acceso a tus datos personales.</li>
            <li>Rectificación de datos inexactos o incompletos.</li>
            <li>Supresión cuando corresponda y no exista obligación legal de conservarlos.</li>
            <li>Actualización de tu información desde tu perfil, cuando la funcionalidad lo permita.</li>
          </ul>
          <p>
            Para ejercer estos derechos, contactanos por{' '}
            <a
              href={BOOKING_FALLBACK_WHATSAPP_URL}
              target="_blank"
              rel="noreferrer"
              className="text-[#e5c185] underline-offset-2 hover:underline"
            >
              WhatsApp
            </a>{' '}
            o acercate al local en {SHOP_ADDRESS}. Responderemos en un plazo razonable.
          </p>
          <p>
            La Agencia de Acceso a la Información Pública (AAIP), en su rol de órgano de control de la Ley 25.326, tiene
            la atribución de atender denuncias y reclamos relacionados con el incumplimiento de las normas sobre
            protección de datos personales.
          </p>
        </Section>

        <Section title="8. Seguridad">
          <p>
            Aplicamos medidas técnicas y organizativas razonables para proteger tus datos frente a accesos no
            autorizados, pérdida, alteración o divulgación indebida. Ningún sistema es 100 % infalible; te recomendamos
            mantener segura tu cuenta de Google y no compartir tus credenciales.
          </p>
        </Section>

        <Section title="9. Cookies y almacenamiento local">
          <p>
            El sitio utiliza almacenamiento local del navegador (por ejemplo, token de sesión) para mantener tu inicio de
            sesión y permitir el funcionamiento de la reserva online. No usamos cookies de publicidad de terceros en el
            sitio. Podés borrar cookies y datos del sitio desde la configuración de tu navegador; tené en cuenta que
            algunas funciones dejarán de estar disponibles.
          </p>
        </Section>

        <Section title="10. Menores de edad">
          <p>
            El servicio está dirigido a personas mayores de 18 años. Si sos menor, necesitás autorización de un padre,
            madre o tutor para usar el sitio y reservar turnos.
          </p>
        </Section>

        <Section title="11. Cambios a esta política">
          <p>
            Podemos actualizar esta política para reflejar cambios en el sitio, en la legislación o en nuestros
            procesos. Publicaremos la versión vigente en esta página e indicaremos la fecha de última actualización.
          </p>
        </Section>

        <Section title="12. Contacto">
          <p>
            Ante dudas sobre privacidad o tratamiento de datos, escribinos por{' '}
            <a
              href={BOOKING_FALLBACK_WHATSAPP_URL}
              target="_blank"
              rel="noreferrer"
              className="text-[#e5c185] underline-offset-2 hover:underline"
            >
              WhatsApp
            </a>{' '}
            o visitanos en {SHOP_ADDRESS}.
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
            to="/terminos"
            className="text-sm font-medium text-zinc-500 underline-offset-2 transition-colors hover:text-[#e5c185] hover:underline"
          >
            Términos y condiciones
          </Link>
        </div>
      </main>
    </div>
  );
}
