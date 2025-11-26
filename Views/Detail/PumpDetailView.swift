import SwiftUI

struct PumpDetailView: View {
    let pump: PetrolPump
    @Environment(\.presentationMode) var presentationMode
    
    var body: some View {
        ZStack {
            LiquidBackground()
            
            VStack(alignment: .leading, spacing: 20) {
                HStack {
                    Button(action: {
                        presentationMode.wrappedValue.dismiss()
                    }) {
                        Image(systemName: "arrow.left")
                            .foregroundColor(.white)
                            .padding()
                            .background(Color.white.opacity(0.2))
                            .clipShape(Circle())
                    }
                    Spacer()
                }
                
                Text(pump.name)
                    .font(.largeTitle)
                    .fontWeight(.bold)
                    .foregroundColor(.white)
                
                VStack(alignment: .leading, spacing: 10) {
                    HStack {
                        Image(systemName: "mappin.and.ellipse")
                        Text(pump.address)
                    }
                    .foregroundColor(.white.opacity(0.9))
                    
                    if pump.isCOCO {
                        Text("COCO - Company Owned Company Operated")
                            .font(.caption)
                            .padding(8)
                            .background(Color.green.opacity(0.3))
                            .cornerRadius(8)
                            .foregroundColor(.green)
                    }
                }
                .padding()
                .glassCard()
                
                Text("Facilities")
                    .font(.title2)
                    .fontWeight(.semibold)
                    .foregroundColor(.white)
                    .padding(.top)
                
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack {
                        ForEach(pump.facilities, id: \.self) { facility in
                            Text(facility)
                                .padding()
                                .background(Color.white.opacity(0.1))
                                .cornerRadius(15)
                                .foregroundColor(.white)
                                .overlay(
                                    RoundedRectangle(cornerRadius: 15)
                                        .stroke(Color.white.opacity(0.3), lineWidth: 1)
                                )
                        }
                    }
                }
                
                Spacer()
                
                Button(action: {
                    openMap(coordinate: pump.coordinate)
                }) {
                    HStack {
                        Image(systemName: "location.fill")
                        Text("Navigate")
                    }
                    .font(.headline)
                    .foregroundColor(.black)
                    .frame(maxWidth: .infinity)
                    .padding()
                    .background(Color.white)
                    .cornerRadius(15)
                }
            }
            .padding()
        }
        .navigationBarHidden(true)
    }
    
    func openMap(coordinate: CoreLocation.CLLocationCoordinate2D) {
        let url = URL(string: "http://maps.apple.com/?daddr=\(coordinate.latitude),\(coordinate.longitude)")!
        if UIApplication.shared.canOpenURL(url) {
            UIApplication.shared.open(url)
        }
    }
}
