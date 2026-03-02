import { useEffect, useMemo, useState } from 'react'
import StatusBadge from './StatusBadge'
import Field from './Field'
import Tooltip from './Tooltip'
import Spinner from './Spinner'
import formatDate from '../utils/helper'

export default function PNRDetails({ selected, onApprove }) {
  const [details, setDetails] = useState(null)
  const [edit, setEdit] = useState({
    rfic: false,
    rfisc: false
  })
  const [codes, setCodes] = useState({ rfic: '', rfisc: '' })
  const [orig, setOrig] = useState({ rfic: '', rfisc: '' })
  const [approving, setApproving] = useState(false)   // NEW

  // Load details (Sabre JSON for GLEBNY, mock for others)
  useEffect(() => {
    let active = true
    async function load() {
      if (!selected) { setDetails(null); return }
      setEdit(false)

      if (selected.pnr === 'GLEBNY') {
        const res = await fetch('/data/sabre-booking.json')
        const data = await res.json()
        if (!active) return
        const traveler = data?.travelers?.[0] || {}
        const anc = traveler?.ancillaries?.[0] || {}
        const flight = data?.flights?.[0] || {}
        const emdTotals = anc?.totals || {}
        const contactEmail = (data?.contactInfo?.emails || [])[0]
        const contactPhone = (data?.contactInfo?.phones || [])[0]
        const ticket = (data?.flightTickets || [])[0] || {}
        const ssr = (data?.specialServices || [])[0] || {}

        const obj = {
          pnr: data?.request?.confirmationId || selected.pnr,
          bookingId: data?.bookingId,
          isTicketed: data?.isTicketed,
          agencyIata: data?.creationDetails?.agencyIataNumber,
          pcc: data?.creationDetails?.userWorkPcc,
          created: `${data?.creationDetails?.creationDate || ''} ${data?.creationDetails?.creationTime || ''}`.trim(),
          contactEmail,
          contactPhone,
          travelerName: `${traveler?.givenName || ''} ${traveler?.middleName || ''} ${traveler?.surname || ''}`.replace(/\s+/g,' ').trim(),
          flightNo: `${flight?.airlineCode || ''} ${flight?.flightNumber || ''}`.trim(),
          operating: `${flight?.operatingAirlineCode || ''} ${flight?.operatingFlightNumber || ''}`.trim(),
          route: `${flight?.fromAirportCode || ''} → ${flight?.toAirportCode || ''}`,
          dep: `${flight?.updatedDepartureDate || flight?.departureDate || ''} ${flight?.updatedDepartureTime || flight?.departureTime || ''}`.trim(),
          arr: `${flight?.updatedArrivalDate || flight?.arrivalDate || ''} ${flight?.updatedArrivalTime || flight?.arrivalTime || ''}`.trim(),
          seat: flight?.seats?.[0]?.number,
          emdNo: anc?.electronicMiscellaneousDocumentNumber,
          rfic: anc?.reasonForIssuanceCode,   // e.g., 'C'
          rfisc: anc?.subcode,                 // e.g., '05Z'
          emdDesc: anc?.commercialName,
          emdStatus: anc?.statusName,
          emdTotal: `${emdTotals?.total || ''} ${emdTotals?.currencyCode || ''}`.trim(),
          ssrCode: ssr?.code,                  // e.g., 'WCHR'
          ticketNo: ticket?.number,
        }
        setDetails(obj)
        setCodes({ rfic: obj.rfic || '', rfisc: obj.rfisc || '' })
        setOrig({ rfic: obj.rfic || '', rfisc: obj.rfisc || '' })
      } else {
        const obj = {
          pnr: selected.pnr,
          bookingId: '1SXXX1A2B3C4D',
          isTicketed: true,
          agencyIata: '99119911',
          pcc: 'AB12',
          created: '2024-01-09 15:00',
          contactEmail: 'travel@sabre.com',
          contactPhone: '+1-555-123-4567',
          travelerName: selected.passenger,
          flightNo: 'AA 123',
          operating: 'UA 321',
          route: 'DFW → HNL',
          dep: '2024-07-09 09:25',
          arr: '2024-07-09 12:38',
          seat: '13A',
          emdNo: '6074333222111',
          rfic: 'C',
          rfisc: '05Z',
          emdDesc: 'UPTO33LB 15KG BAGGAGE',
          emdStatus: 'Confirmed',
          emdTotal: '128.00 USD',
          ssrCode: 'WCHR',
          ticketNo: '0167489825830',
        }
        setDetails(obj)
        setCodes({ rfic: obj.rfic, rfisc: obj.rfisc })
        setOrig({ rfic: obj.rfic, rfisc: obj.rfisc })
      }
    }
    load()
    return () => { active = false }
  }, [selected])

  //Check isHuman before any early return
const dirty = useMemo(
    () => codes.rfic !== orig.rfic || codes.rfisc !== orig.rfisc,
    [codes, orig]
  )
  const isHuman = selected?.status === 'human'

  if (!selected) return null

  async function approveIfClean(){
    if (dirty) return
    setApproving(true)
    try {
      // simulate async approve
      await new Promise(r => setTimeout(r, 600))
      onApprove?.({ pnr: selected.pnr, rfic: codes.rfic, rfisc: codes.rfisc })
    } finally {
      setApproving(false)
    }
  }
  async function saveEdits(){
    setApproving(true)
    try {
      await new Promise(r => setTimeout(r, 600))
      onApprove?.({ pnr: selected.pnr, rfic: codes.rfic, rfisc: codes.rfisc })
      setOrig({ ...codes })
      setEdit(false)
    } finally {
      setApproving(false)
    }
  }

  return (
    <div className="card mt-4 p-4 mb-10">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-xl">
          <i className="fa-solid fa-ticket text-brand-red"></i> PNR Details • <span className="text-brand-red">{selected.pnr}</span>
        </h3>
        <div className="text-sm text-black/60 flex items-center gap-2">
          <span>Current Status:</span>
          <StatusBadge status={selected.status} />
        </div>
      </div>

      {details ? (
        <div className="mt-8 space-y-8 text-sm mb-4">
          {/* PNR & Booking */}
          <section>
            <h4 className="section-title text-md"><i className="fa-solid fa-clipboard-list text-brand-red"></i> PNR & Booking</h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              <Field k={<><i className="fa-solid fa-paperclip text-black/60"></i> PNR</>} v={details.pnr || '-'} />
              <Field k={<><i className="fa-solid fa-file-invoice text-black/60"></i> Booking ID</>} v={details.bookingId || '—'} />
              <Field k={<><i className="fa-solid fa-ticket text-black/60"></i> Ticketed</>} v={details.isTicketed ? 'Yes' : 'No'} />
              <Field k={<><i className="fa-regular fa-clock text-black/60"></i> Date Created</>} v={formatDate(details.created) || '—'} />
              <Field k={<><i className="fa-solid fa-building text-black/60"></i> Agency IATA</>} v={details.agencyIata || '—'} />
              <Field k={<><i className="fa-solid fa-key text-black/60"></i> PCC</>} v={details.pcc || '—'} />
              <Field k={<><i className="fa-regular fa-envelope text-black/60"></i> Email</>} v={details.contactEmail || '—'} />
              <Field k={<><i className="fa-solid fa-phone text-black/60"></i> Phone</>} v={details.contactPhone || '—'} />
            </div>
          </section>

          {/* Traveler & Flight */}
          <section>
            <h4 className="section-title text-md"><i className="fa-solid fa-person-walking-luggage text-brand-red"></i> Traveler & Flight</h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              <Field k={<><i className="fa-regular fa-user text-black/60"></i> Passenger</>} v={details.travelerName || '—'} />
              <Field k={<><i className="fa-solid fa-plane text-black/60"></i> Flight No.</>} v={details.flightNo || '—'} />
              <Field k={<><i className="fa-solid fa-tag text-black/60"></i> Operating</>} v={details.operating || '—'} />
              <Field k={<><i className="fa-solid fa-location-dot text-black/60"></i> Route</>} v={details.route || '—'} />
              <Field k={<><i className="fa-solid fa-plane-departure text-black/60"></i> Departure</>} v={formatDate(details.dep) || '—'} />
              <Field k={<><i className="fa-solid fa-plane-arrival text-black/60"></i> Arrival</>} v={formatDate(details.arr) || '—'} />
              <Field k={<><i className="fa-solid fa-chair text-black/60"></i> Seat</>} v={details.seat || '—'} />
              <Field k={<><i className="fa-solid fa-hashtag text-black/60"></i> Ticket No.</>} v={details.ticketNo || '—'} />
            </div>
          </section>

          {/* EMD & SSR */}
          <section>
            <h4 className="section-title text-md"><i className="fa-solid fa-passport text-brand-red"></i> EMD & SSR</h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              <Field k={<><i className="fa-solid fa-ticket text-black/60"></i> EMD No.</>} v={details.emdNo || '—'} />
              <Field k={<><i className="fa-regular fa-circle-dot text-black/60"></i> EMD Status</>} v={details.emdStatus || '—'} />
              <Field k={<><i className="fa-solid fa-dollar-sign text-black/60"></i> EMD Total</>} v={details.emdTotal || '—'} />
              <Field k={<><i className="fa-solid fa-suitcase-rolling text-black/60"></i> EMD Desc</>} v={details.emdDesc || '—'} />
              <Field k={<><i className="fa-solid fa-puzzle-piece text-black/60"></i> SSR</>} v={details.ssrCode || '—'} />

              {/* RFIC with inline actions */}
              <div className={`bg-black/5 border  ${isHuman ? 'border-2 border-red-500' : 'border-black/10'} rounded p-3`}>
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1">
                    <div className="text-md text-black/50">RFIC
                      {isHuman ? (
                        <Tooltip content={
                          <>
                            <span className="block text-md">{'Other info "unassisted minor international" maps to Qantas airline emd-s code.'}</span>
                            <span className="block text-md">{'Retrieved from article from Sabre Central : '}<a className="underline text-blue-400 hover:text-blue-800" href='https://www.qantas.com/content/dam/qac/policies-and-guidelines/emd-quick-reference-guide.pdf' target="_blank">{'Airline EMD Codes'}</a></span>
                          </>
                          
                        } closeMode="manual" position="top">
                          <button
                            type="button"
                            className="ml-1 inline-flex h-4 w-4 items-center justify-center rounded text-black/50 hover:text-brand-red focus:outline-none focus:ring-2 focus:ring-brand-red"
                            aria-label={`More info about RFIC`}
                          >
                            <i className="fa-solid fa-circle-info text-[14px]"></i>
                          </button>
                        </Tooltip>
                      ) : (
                        ''
                      )}
                    </div>
                    
                    {isHuman && edit.rfic ? (
                      <input className="input mt-1 font-medium w-full" value={codes.rfic} onChange={e=>setCodes({...codes, rfic: e.target.value})} />
                    ) : (
                      <div className="mt-2 font-medium">{codes.rfic || '—'}</div>
                    )}
                  </div>
                  <div className="flex items-center gap-1 mt-5 shrink-0">
                    {!isHuman ? null : (
                      edit.rfic ? (
                        <>
                          <button className="btn btn-primary mt-1.5" title="Save changes" onClick={saveEdits}><i className="fa-solid fa-floppy-disk"></i></button>
                          <button className="btn btn-secondary mt-1.5" title="Cancel" onClick={()=>{ setEdit(prev => ({...prev, rfic: false})); setCodes({...codes, rfic: details.rfic}) }}><i className="fa-solid fa-xmark"></i></button>
                        </>
                      ) : (
                        <>
                          {/* <button className="btn btn-success disabled:opacity-40" disabled={dirty} title="Approve (no changes)" onClick={approveIfClean}><i className="fa-solid fa-check"></i></button> */}
                          <button className="btn btn-outline" title="Edit RFIC" onClick={()=>setEdit(prev => ({...prev, rfic: true}))}><i className="fa-solid fa-pen"></i></button>
                        </>
                      )
                    )}
                  </div>
                </div>
              </div>

              {/* RFISC with inline actions */}
              <div className={`bg-black/5 border ${isHuman ? 'border-2 border-red-500' : 'border-black/10'} rounded p-3`}>
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1">
                    <div className="text-md text-black/50">RFISC
                      {isHuman ? (
                        <Tooltip content={
                          <>
                            <span className="block text-md">{'Other info "unassisted minor international" maps to Qantas airline emd-s code.'}</span>
                            <span className="block text-md">{'Retrieved from article from Sabre Central : '}<a className="underline text-blue-400 hover:text-blue-800" href='https://www.qantas.com/content/dam/qac/policies-and-guidelines/emd-quick-reference-guide.pdf' target="_blank">{'Airline EMD Codes'}</a></span>
                          </>
                          
                        } closeMode="manual" position="top">
                          <button
                            type="button"
                            className="ml-1 inline-flex h-4 w-4 items-center justify-center rounded text-black/50 hover:text-brand-red focus:outline-none focus:ring-2 focus:ring-brand-red"
                            aria-label={`More info about RFIC`}
                          >
                            <i className="fa-solid fa-circle-info text-[14px]"></i>
                          </button>
                        </Tooltip>
                      ) : (
                        ''
                      )}
                    </div>
                    {isHuman && edit.rfisc ? (
                      <input className="input mt-1 font-medium w-full p-0" value={codes.rfisc} onChange={e=>setCodes({...codes, rfisc: e.target.value})} />
                    ) : (
                      <div className="mt-2 font-medium">{codes.rfisc || '—'}</div>
                    )}
                  </div>
                  <div className="flex items-center gap-1 mt-5 shrink-0">
                    {!isHuman ? null : (
                      edit.rfisc ? (
                        <>
                          <button className="btn btn-primary mt-1.5" title="Save changes" onClick={saveEdits}><i className="fa-solid fa-floppy-disk"></i></button>
                          <button className="btn btn-secondary mt-1.5" title="Cancel" onClick={()=>{ setEdit(prev => ({...prev, rfisc: false})); setCodes({...codes, rfisc: details.rfisc}) }}><i className="fa-solid fa-xmark"></i></button>
                        </>
                      ) : (
                        <>
                          {/* <button className="btn btn-success disabled:opacity-40" disabled={dirty} title="Approve (no changes)" onClick={approveIfClean}><i className="fa-solid fa-check"></i></button> */}
                          <button className="btn btn-outline" title="Edit RFISC" onClick={()=>setEdit(prev => ({...prev, rfisc: true}))}><i className="fa-solid fa-pen"></i></button>
                        </>
                      )
                    )}
                  </div>
                </div>
              </div>
            </div>
            {isHuman ? (
              <div className='flex w-full justify-center'>
                <button className="btn btn-success mt-8 h-[45px] w-full md:w-1/2 lg:w-1/3 justify-center" title="Refresh all EMDs & statuses"><i className="fa-regular fa-paper-plane"></i> Build AE</button>
              </div>
            ) : (
              ''
            )}
            
          </section>
        </div>
      ) : (
        <p className="text-black/70">Loading details…</p>
      )}
    </div>
  )
}

