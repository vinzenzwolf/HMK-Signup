import {
  Document,
  Image,
  Page,
  pdf,
  StyleSheet,
  Text,
  View,
} from '@react-pdf/renderer'
import { useState } from 'react'

type InvoiceSectionProps = {
  clubName: string
  trainerName: string
  athleteCount: number
  totalAmount: number
  invoiceDate: Date
  dueDate: Date
  logoSrc?: string | null
  billDataUrl?: string | null
  onDownloadClick?: () => Promise<boolean> | boolean
}

type InvoiceDocumentProps = InvoiceSectionProps

const invoiceStyles = StyleSheet.create({
  page: {
    padding: 32,
    fontFamily: 'Helvetica',
    fontSize: 12,
    lineHeight: 1.4,
    position: 'relative',
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  title: {
    fontSize: 22,
    fontWeight: 700,
    marginBottom: 16,
  },
  logo: {
    width: 110,
    height: 60,
    objectFit: 'contain',
  },
  logoFallback: {
    fontSize: 12,
    color: '#475569',
  },
  divider: {
    height: 1,
    backgroundColor: '#0f172a',
    marginVertical: 12,
  },
  billDivider: {
    marginTop: 8,
    marginBottom: 0,
  },
  meta: {
    gap: 4,
    marginBottom: 18,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: 700,
    marginBottom: 8,
  },
  table: {
    borderWidth: 1,
    borderColor: '#0f172a',
    borderStyle: 'solid',
    width: '100%',
  },
  tableRow: {
    flexDirection: 'row',
    alignItems: 'stretch',
  },
  tableHeader: {
    fontWeight: 700,
  },
  tableCell: {
    borderRightWidth: 1,
    borderRightColor: '#0f172a',
    borderBottomWidth: 1,
    borderBottomColor: '#0f172a',
    paddingVertical: 8,
    paddingHorizontal: 10,
    fontSize: 11,
  },
  descriptionCol: {
    width: '60%',
  },
  qtyCol: {
    width: '15%',
    textAlign: 'center',
  },
  amountCol: {
    width: '25%',
    textAlign: 'right',
  },
  lastInRow: {
    borderRightWidth: 0,
  },
  totalRow: {
    fontWeight: 700,
  },
  notice: {
    marginTop: 18,
    fontSize: 11,
  },
  billWrapper: {
    marginTop: 0,
    gap: 6,
    width: '100%',
    alignItems: 'center',
    marginLeft: 38,
    marginBottom: -30,
  },
  billImage: {
    width: '120%',
    maxWidth: '120%',
    objectFit: 'contain',
  },
})

function formatCurrency(amount: number) {
  return amount.toFixed(2)
}

function formatLocaleDate(date: Date) {
  return date.toLocaleDateString('de-CH', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })
}

function InvoiceDocument({
  clubName,
  trainerName,
  athleteCount,
  totalAmount,
  invoiceDate,
  dueDate,
  logoSrc,
  billDataUrl,
}: InvoiceDocumentProps) {
  return (
    <Document>
      <Page size="A4" style={invoiceStyles.page}>
        <View style={invoiceStyles.headerRow}>
          <View>
            <Text style={invoiceStyles.title}>Rechnung Hallenmehrkampf</Text>
            <Text>SC Liestal</Text>
          </View>
          {logoSrc && (logoSrc.startsWith('data:image') || logoSrc.startsWith('http') || logoSrc.startsWith('/')) ? (
            <Image src={logoSrc} style={invoiceStyles.logo} />
          ) : (
            <Text style={invoiceStyles.logoFallback}>SC Liestal</Text>
          )}
        </View>

        <View style={invoiceStyles.divider} />

        <View style={invoiceStyles.meta}>
          <Text>Rechnung an: {clubName || 'Verein'}</Text>
          <Text>Kontaktperson: {trainerName || 'Trainer/in'}</Text>
          <Text>Rechnungsdatum: {formatLocaleDate(invoiceDate)}</Text>
          <Text>Zahlbar bis: {formatLocaleDate(dueDate)}</Text>
        </View>

        <Text style={invoiceStyles.sectionTitle}>Leistungsübersicht</Text>

        <View style={invoiceStyles.table}>
          <View style={[invoiceStyles.tableRow, invoiceStyles.tableHeader]}>
            <Text style={[invoiceStyles.tableCell, invoiceStyles.descriptionCol]}>Beschreibung</Text>
            <Text style={[invoiceStyles.tableCell, invoiceStyles.qtyCol]}>Anzahl</Text>
            <Text style={[invoiceStyles.tableCell, invoiceStyles.amountCol, invoiceStyles.lastInRow]}>
              Betrag (CHF)
            </Text>
          </View>

          <View style={invoiceStyles.tableRow}>
            <Text style={[invoiceStyles.tableCell, invoiceStyles.descriptionCol]}>
              Anmeldung Hallenmehrkampf
            </Text>
            <Text style={[invoiceStyles.tableCell, invoiceStyles.qtyCol]}>{athleteCount}</Text>
            <Text style={[invoiceStyles.tableCell, invoiceStyles.amountCol, invoiceStyles.lastInRow]}>
              {formatCurrency(totalAmount)}
            </Text>
          </View>

          <View style={[invoiceStyles.tableRow, invoiceStyles.totalRow]}>
            <Text style={[invoiceStyles.tableCell, invoiceStyles.descriptionCol]}>
              Total
            </Text>
            <Text style={[invoiceStyles.tableCell, invoiceStyles.qtyCol]} />
            <Text style={[invoiceStyles.tableCell, invoiceStyles.amountCol, invoiceStyles.lastInRow]}>
              {formatCurrency(totalAmount)}
            </Text>
          </View>
        </View>

        <View style={invoiceStyles.notice}>
          <Text>
            Bitte überweisen Sie den Rechnungsbetrag bis zum angegebenen Fälligkeitsdatum.
          </Text>
          <Text>
            Bei Fragen zur Rechnung kontaktieren Sie uns gerne unter info@scl-athletics.ch.
          </Text>
        </View>

        <View style={{ flexGrow: 1 }} />

        {billDataUrl && billDataUrl.startsWith('data:image') ? (
          <>
            <View style={[invoiceStyles.divider, invoiceStyles.billDivider]} />
            <View style={invoiceStyles.billWrapper}>
              <Image src={billDataUrl} style={invoiceStyles.billImage} />
            </View>
          </>
        ) : null}
      </Page>
    </Document>
  )
}

function InvoiceSection({
  clubName,
  trainerName,
  athleteCount,
  totalAmount,
  invoiceDate,
  dueDate,
  logoSrc,
  billDataUrl,
  onDownloadClick,
}: InvoiceSectionProps) {
  const [isPreparingDownload, setIsPreparingDownload] = useState(false)
  const [isGeneratingPDF, setIsGeneratingPDF] = useState(false)

  const invoiceDocument = (
    <InvoiceDocument
      clubName={clubName}
      trainerName={trainerName}
      athleteCount={athleteCount}
      totalAmount={totalAmount}
      invoiceDate={invoiceDate}
      dueDate={dueDate}
      logoSrc={logoSrc}
      billDataUrl={billDataUrl}
    />
  )

  const fileName = `rechnung-${(clubName || 'verein').replace(/\s+/g, '-').toLowerCase()}.pdf`

  const handleDownloadClick = async () => {
    // First validate and save if callback provided
    if (onDownloadClick) {
      setIsPreparingDownload(true)
      try {
        const result = await onDownloadClick()
        if (!result) {
          setIsPreparingDownload(false)
          return
        }
      } catch (error) {
        console.error('Error preparing download:', error)
        setIsPreparingDownload(false)
        return
      }
    }

    // Generate PDF and download
    setIsGeneratingPDF(true)
    try {
      const blob = await pdf(invoiceDocument).toBlob()
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = fileName
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      URL.revokeObjectURL(url)
    } catch (error) {
      console.error('Error generating PDF:', error)
    } finally {
      setIsPreparingDownload(false)
      setIsGeneratingPDF(false)
    }
  }

  return (
    <section>
      <header>
        <h2>Rechnung</h2>
      </header>
      <div className="invoice-box">
        <p>Erhalte eine Rechnung als PDF auf Basis der aktuellen Angaben.</p>
        <button
          type="button"
          className="invoice-button"
          aria-label="Rechnung als PDF herunterladen"
          onClick={handleDownloadClick}
          disabled={isPreparingDownload || isGeneratingPDF}
        >
          {isPreparingDownload
            ? 'Wird gespeichert...'
            : isGeneratingPDF
              ? 'PDF wird erstellt...'
              : 'Rechnung als PDF herunterladen'}
        </button>
      </div>
    </section>
  )
}

export default InvoiceSection

