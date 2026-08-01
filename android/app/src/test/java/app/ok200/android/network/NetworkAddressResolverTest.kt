package app.ok200.android.network

import java.net.InetAddress
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertTrue

class NetworkAddressResolverTest {
    @Test
    fun ordinaryDualStackNetworkKeepsIpv4AndIpv6() {
        val addresses = classify(
            chromeOs = false,
            peerFacingNetwork = true,
            "192.168.1.44/24",
            "fe80::1/64",
            "2a02:1210:161d:e300::44/64"
        )

        assertEquals(
            listOf("192.168.1.44", "2a02:1210:161d:e300:0:0:0:44"),
            addresses.filter { it.usableFromAnotherDevice }.map { it.address }
        )
        assertFalse(addresses.single { it.address == "fe80:0:0:0:0:0:0:1" }.usableFromAnotherDevice)
    }

    @Test
    fun chromeOsSuppressesGuestIpv4ButKeepsGlobalIpv6() {
        val addresses = classify(
            chromeOs = true,
            peerFacingNetwork = true,
            "100.115.92.2/30",
            "100.115.92.22/30",
            "2a02:1210:161d:e300::22/64"
        )

        val ipv4 = addresses.filter { it.family == NetworkAddressFamily.IPV4 }
        assertTrue(ipv4.all { it.availability == NetworkAddressAvailability.CHROMEOS_GUEST })
        assertEquals(
            listOf("2a02:1210:161d:e300:0:0:0:22"),
            addresses.filter { it.usableFromAnotherDevice }.map { it.address }
        )
    }

    @Test
    fun chromeOsNeverTreatsAnAndroidIpv4AsPeerFacing() {
        val addresses = classify(
            chromeOs = true,
            peerFacingNetwork = true,
            "192.168.50.2/24",
            "8.8.8.8/32"
        )

        assertTrue(addresses.all { it.availability == NetworkAddressAvailability.CHROMEOS_GUEST })
    }

    @Test
    fun loopbackLinkLocalAndUnspecifiedAddressesAreDeviceOnly() {
        val addresses = classify(
            chromeOs = false,
            peerFacingNetwork = true,
            "127.0.0.1/8",
            "0.0.0.0/0",
            "169.254.3.4/16",
            "::1/128",
            "::/0"
        )

        assertTrue(addresses.none { it.usableFromAnotherDevice })
    }

    @Test
    fun uniqueLocalIpv6IsUsableAndFormattedWithBrackets() {
        val address = classify(
            chromeOs = false,
            peerFacingNetwork = true,
            "fd12:3456:789a::5/64"
        ).single()

        assertEquals(NetworkAddressScope.UNIQUE_LOCAL, address.scope)
        assertTrue(address.usableFromAnotherDevice)
        assertEquals("http://[fd12:3456:789a:0:0:0:0:5]:8080", address.httpUrl(8080))
    }

    @Test
    fun ipv4UrlRemainsUnbracketed() {
        val address = classify(chromeOs = false, peerFacingNetwork = true, "10.0.0.5/8").single()

        assertEquals(NetworkAddressScope.PRIVATE, address.scope)
        assertEquals("http://10.0.0.5:9090", address.httpUrl(9090))
    }

    @Test
    fun sharedIpv4RangeIsClassifiedWithoutBeingDroppedOnOrdinaryAndroid() {
        val address = classify(
            chromeOs = false,
            peerFacingNetwork = true,
            "100.100.20.3/10"
        ).single()

        assertEquals(NetworkAddressScope.SHARED, address.scope)
        assertTrue(address.usableFromAnotherDevice)
    }

    @Test
    fun cellularOrVpnActiveNetworkIsNotPresentedAsPeerFacing() {
        val addresses = classify(
            chromeOs = false,
            peerFacingNetwork = false,
            "10.20.30.40/8",
            "2001:4860:4860::8844/64"
        )

        assertTrue(
            addresses.all {
                it.availability == NetworkAddressAvailability.NON_LAN_TRANSPORT
            }
        )
    }

    @Test
    fun duplicateAddressesAcrossInterfacesAreCollapsed() {
        val addresses = NetworkAddressPolicy.classify(
            candidates = listOf(
                candidate("wlan0", "192.168.1.20", 24),
                candidate("wlan1", "192.168.1.20", 24)
            ),
            isChromeOs = false,
            peerFacingNetwork = true
        )

        assertEquals(1, addresses.size)
        assertEquals("wlan0", addresses.single().interfaceName)
    }

    private fun classify(
        chromeOs: Boolean,
        peerFacingNetwork: Boolean,
        vararg values: String
    ): List<ServerNetworkAddress> =
        NetworkAddressPolicy.classify(
            candidates = values.mapIndexed { index, value ->
                val (host, prefix) = value.split('/')
                candidate("if$index", host, prefix.toInt())
            },
            isChromeOs = chromeOs,
            peerFacingNetwork = peerFacingNetwork
        )

    private fun candidate(
        interfaceName: String,
        host: String,
        prefixLength: Int
    ): CandidateNetworkAddress = CandidateNetworkAddress(
        interfaceName = interfaceName,
        address = InetAddress.getByName(host),
        prefixLength = prefixLength
    )
}
